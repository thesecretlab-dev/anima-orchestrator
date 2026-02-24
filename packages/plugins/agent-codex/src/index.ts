import {
  shellEscape,
  type Agent,
  type AgentSessionInfo,
  type AgentLaunchConfig,
  type ActivityState,
  type ActivityDetection,
  type PluginModule,
  type RuntimeHandle,
  type Session,
  type CostEstimate,
  type WorkspaceHooksConfig,
} from "@composio/ao-core";
import { execFile } from "node:child_process";
import { writeFile, mkdir, readFile, readdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

/** Shared bin directory for ao shell wrappers (prepended to PATH) */
const AO_BIN_DIR = join(homedir(), ".ao", "bin");

// =============================================================================
// Plugin Manifest
// =============================================================================

export const manifest = {
  name: "codex",
  slot: "agent" as const,
  description: "Agent plugin: OpenAI Codex CLI",
  version: "0.1.0",
};

// =============================================================================
// Shell Wrappers (automatic metadata updates — like Claude Code's PostToolUse)
// =============================================================================

/**
 * Helper script sourced by both gh and git wrappers.
 * Provides update_ao_metadata() for writing key=value to the session file.
 */
/* eslint-disable no-useless-escape -- \$ escapes are intentional: bash scripts in JS template literals */
const AO_METADATA_HELPER = `#!/usr/bin/env bash
# ao-metadata-helper — shared by gh/git wrappers
# Provides: update_ao_metadata <key> <value>

update_ao_metadata() {
  local key="\$1" value="\$2"
  local ao_dir="\${AO_DATA_DIR:-}"
  local ao_session="\${AO_SESSION:-}"

  [[ -z "\$ao_dir" || -z "\$ao_session" ]] && return 0

  # Validate: session name must not contain path separators or traversal
  case "\$ao_session" in
    */* | *..*) return 0 ;;
  esac

  # Validate: ao_dir must be an absolute path under known ao directories or /tmp
  case "\$ao_dir" in
    "\$HOME"/.ao/* | "\$HOME"/.agent-orchestrator/* | /tmp/*) ;;
    *) return 0 ;;
  esac

  local metadata_file="\$ao_dir/\$ao_session"

  # Resolve and verify the file is still within ao_dir
  local real_dir real_ao_dir
  real_ao_dir="\$(cd "\$ao_dir" 2>/dev/null && pwd -P)" || return 0
  real_dir="\$(cd "\$(dirname "\$metadata_file")" 2>/dev/null && pwd -P)" || return 0
  [[ "\$real_dir" == "\$real_ao_dir"* ]] || return 0

  [[ -f "\$metadata_file" ]] || return 0

  local temp_file="\${metadata_file}.tmp.\$\$"

  # Strip newlines from value to prevent metadata line injection
  local clean_value="\$(printf '%s' "\$value" | tr -d '\\n')"

  # Escape sed metacharacters in value (& expands to matched text, | breaks delimiter)
  local escaped_value="\$(printf '%s' "\$clean_value" | sed 's/[&|\\\\]/\\\\&/g')"

  if grep -q "^\${key}=" "\$metadata_file" 2>/dev/null; then
    sed "s|^\${key}=.*|\${key}=\${escaped_value}|" "\$metadata_file" > "\$temp_file"
  else
    cp "\$metadata_file" "\$temp_file"
    printf '%s=%s\\n' "\$key" "\$clean_value" >> "\$temp_file"
  fi

  mv "\$temp_file" "\$metadata_file"
}
`;

/**
 * gh wrapper — intercepts `gh pr create` and `gh pr merge` to auto-update
 * session metadata. All other commands pass through transparently.
 */
const GH_WRAPPER = `#!/usr/bin/env bash
# ao gh wrapper — auto-updates session metadata on PR operations

# Find real gh by removing our wrapper directory from PATH
ao_bin_dir="\$(cd "\$(dirname "\$0")" && pwd)"
clean_path="\$(echo "\$PATH" | tr ':' '\\n' | grep -Fxv "\$ao_bin_dir" | grep . | tr '\\n' ':')"
clean_path="\${clean_path%:}"
real_gh="\$(PATH="\$clean_path" command -v gh 2>/dev/null)"

if [[ -z "\$real_gh" ]]; then
  echo "ao-wrapper: gh not found in PATH" >&2
  exit 127
fi

# Source the metadata helper
source "\$ao_bin_dir/ao-metadata-helper.sh" 2>/dev/null || true

# Only capture output for commands we need to parse (pr/create, pr/merge).
# All other commands pass through transparently without stream merging.
case "\$1/\$2" in
  pr/create|pr/merge)
    tmpout="\$(mktemp)"
    trap 'rm -f "\$tmpout"' EXIT

    "\$real_gh" "\$@" 2>&1 | tee "\$tmpout"
    exit_code=\${PIPESTATUS[0]}

    if [[ \$exit_code -eq 0 ]]; then
      output="\$(cat "\$tmpout")"
      case "\$1/\$2" in
        pr/create)
          pr_url="\$(echo "\$output" | grep -Eo 'https://github\\.com/[^/]+/[^/]+/pull/[0-9]+' | head -1)"
          if [[ -n "\$pr_url" ]]; then
            update_ao_metadata pr "\$pr_url"
            update_ao_metadata status pr_open
          fi
          ;;
        pr/merge)
          update_ao_metadata status merged
          ;;
      esac
    fi

    exit \$exit_code
    ;;
  *)
    exec "\$real_gh" "\$@"
    ;;
esac
`;

/**
 * git wrapper — intercepts branch creation commands to auto-update metadata.
 * All other commands pass through transparently.
 */
const GIT_WRAPPER = `#!/usr/bin/env bash
# ao git wrapper — auto-updates session metadata on branch operations

# Find real git by removing our wrapper directory from PATH
ao_bin_dir="\$(cd "\$(dirname "\$0")" && pwd)"
clean_path="\$(echo "\$PATH" | tr ':' '\\n' | grep -Fxv "\$ao_bin_dir" | grep . | tr '\\n' ':')"
clean_path="\${clean_path%:}"
real_git="\$(PATH="\$clean_path" command -v git 2>/dev/null)"

if [[ -z "\$real_git" ]]; then
  echo "ao-wrapper: git not found in PATH" >&2
  exit 127
fi

# Source the metadata helper
source "\$ao_bin_dir/ao-metadata-helper.sh" 2>/dev/null || true

# Run real git
"\$real_git" "\$@"
exit_code=\$?

# Only update metadata on success
if [[ \$exit_code -eq 0 ]]; then
  case "\$1/\$2" in
    checkout/-b)
      update_ao_metadata branch "\$3"
      ;;
    switch/-c)
      update_ao_metadata branch "\$3"
      ;;
  esac
fi

exit \$exit_code
`;

// =============================================================================
// Workspace Setup
// =============================================================================

/**
 * Section appended to AGENTS.md as a secondary signal. The PATH-based wrappers
 * handle metadata updates automatically, but AGENTS.md reinforces the intent
 * and helps if the wrappers are bypassed.
 */
const AO_AGENTS_MD_SECTION = `
## Agent Orchestrator (ao) Session — Codex

You are running inside an ANIMA Agent Orchestrator managed workspace (Codex agent).
Session metadata is updated automatically via shell wrappers for git/gh commands.

**Important for Codex:**
- Use \`--full-auto\` mode when spawned by the orchestrator
- Commit frequently — the orchestrator tracks your progress via git
- When done, create a PR with \`gh pr create\` — metadata updates automatically
- If tests fail after PR creation, the orchestrator will send you the CI logs

If automatic updates fail, you can manually update metadata:
\`\`\`bash
source ~/.ao/bin/ao-metadata-helper.sh
update_ao_metadata <key> <value>
\`\`\`
`;
/* eslint-enable no-useless-escape */

/**
 * Atomically write a file by writing to a temp file in the same directory,
 * then renaming. This prevents concurrent sessions from reading partially
 * written wrapper scripts.
 */
async function atomicWriteFile(filePath: string, content: string, mode: number): Promise<void> {
  const suffix = randomBytes(6).toString("hex");
  const tmpPath = `${filePath}.tmp.${suffix}`;
  await writeFile(tmpPath, content, { encoding: "utf-8", mode });
  await rename(tmpPath, filePath);
}

async function setupCodexWorkspace(workspacePath: string): Promise<void> {
  // 1. Write shared wrappers to ~/.ao/bin/
  await mkdir(AO_BIN_DIR, { recursive: true });

  await atomicWriteFile(
    join(AO_BIN_DIR, "ao-metadata-helper.sh"),
    AO_METADATA_HELPER,
    0o755,
  );

  // Only write wrappers if they don't exist or are outdated (check marker)
  const markerPath = join(AO_BIN_DIR, ".ao-version");
  const currentVersion = "0.1.0";
  let needsUpdate = true;
  try {
    const existing = await readFile(markerPath, "utf-8");
    if (existing.trim() === currentVersion) needsUpdate = false;
  } catch {
    // File doesn't exist — needs update
  }

  if (needsUpdate) {
    // Write wrappers atomically, then write the version marker last.
    // If we crash between wrapper writes and marker write, the next
    // invocation will redo the writes (safe: wrappers are idempotent).
    await atomicWriteFile(join(AO_BIN_DIR, "gh"), GH_WRAPPER, 0o755);
    await atomicWriteFile(join(AO_BIN_DIR, "git"), GIT_WRAPPER, 0o755);
    await atomicWriteFile(markerPath, currentVersion, 0o644);
  }

  // 2. Append ao section to AGENTS.md (create if missing, skip if already present)
  const agentsMdPath = join(workspacePath, "AGENTS.md");
  let existing = "";
  try {
    existing = await readFile(agentsMdPath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  if (!existing.includes("Agent Orchestrator (ao) Session")) {
    const content = existing
      ? existing.trimEnd() + "\n" + AO_AGENTS_MD_SECTION
      : AO_AGENTS_MD_SECTION.trimStart();
    await writeFile(agentsMdPath, content, "utf-8");
  }
}

// =============================================================================
// Agent Implementation
// =============================================================================

function createCodexAgent(): Agent {
  return {
    name: "codex",
    processName: "codex",

    getLaunchCommand(config: AgentLaunchConfig): string {
      const parts: string[] = ["codex"];

      if (config.permissions === "skip") {
        parts.push("--full-auto");
      }

      if (config.model) {
        parts.push("--model", shellEscape(config.model));
      }

      // Codex supports --quiet for less verbose output (better for automation)
      parts.push("--quiet");

      if (config.systemPromptFile) {
        // Codex reads developer instructions from a file via config override
        parts.push("-c", `model_instructions_file=${shellEscape(config.systemPromptFile)}`);
      } else if (config.systemPrompt) {
        // Codex accepts inline developer instructions via config override
        parts.push("-c", `developer_instructions=${shellEscape(config.systemPrompt)}`);
      }

      // If working directory is specified, Codex can use --cwd
      if (config.workingDirectory) {
        parts.push("--cwd", shellEscape(config.workingDirectory));
      }

      if (config.prompt) {
        // Use `--` to end option parsing so prompts starting with `-` aren't
        // misinterpreted as flags.
        parts.push("--", shellEscape(config.prompt));
      }

      return parts.join(" ");
    },

    getEnvironment(config: AgentLaunchConfig): Record<string, string> {
      const env: Record<string, string> = {};
      env["AO_SESSION_ID"] = config.sessionId;
      // NOTE: AO_PROJECT_ID is the caller's responsibility (spawn.ts sets it)
      if (config.issueId) {
        env["AO_ISSUE_ID"] = config.issueId;
      }

      // Prepend ~/.ao/bin to PATH so our gh/git wrappers intercept commands.
      // The wrappers strip this directory from PATH before calling the real
      // binary, so there's no infinite recursion.
      env["PATH"] = `${AO_BIN_DIR}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;

      return env;
    },

    detectActivity(terminalOutput: string): ActivityState {
      if (!terminalOutput.trim()) return "idle";

      const lines = terminalOutput.trim().split("\n");
      const lastLine = lines[lines.length - 1]?.trim() ?? "";

      // If Codex is showing its input prompt, it's idle
      if (/^[>$#]\s*$/.test(lastLine)) return "idle";
      // Codex "ready" prompt patterns
      if (/codex>\s*$/i.test(lastLine)) return "idle";
      if (/waiting for input/i.test(lastLine)) return "idle";

      // Check last few lines for approval prompts
      const tail = lines.slice(-8).join("\n");
      if (/approval required/i.test(tail)) return "waiting_input";
      if (/\(y\)es.*\(n\)o/i.test(tail)) return "waiting_input";
      if (/confirm.*\[y\/n\]/i.test(tail)) return "waiting_input";
      if (/do you want to proceed/i.test(tail)) return "waiting_input";
      // Codex sandbox approval
      if (/allow.*sandbox/i.test(tail)) return "waiting_input";
      if (/press enter to continue/i.test(tail)) return "waiting_input";

      // Error/stuck detection
      if (/error:|exception:|traceback|fatal:/i.test(tail)) return "error";
      if (/rate.?limit|429|quota exceeded/i.test(tail)) return "waiting_input";

      // Default to active
      return "active";
    },

    async getActivityState(session: Session, readyThresholdMs?: number): Promise<ActivityDetection | null> {
      // Check if process is running first
      if (!session.runtimeHandle) return { state: "exited" };
      const running = await this.isProcessRunning(session.runtimeHandle);
      if (!running) return { state: "exited" };

      // Try to infer activity from Codex session files.
      // Codex stores rollout files in ~/.codex/sessions/ — we attempt to match
      // by checking mtime proximity to session start time.
      const threshold = readyThresholdMs ?? 60_000;
      const codexSessionDir = join(homedir(), ".codex", "sessions");
      try {
        const entries = await readdir(codexSessionDir);
        const jsonFiles = entries.filter(f => f.endsWith(".json"));
        if (jsonFiles.length === 0) return null;

        // Find the session file closest to our session start time
        const sessionStart = session.startedAt ? new Date(session.startedAt).getTime() : 0;
        let bestFile: string | null = null;
        let bestDelta = Infinity;

        const { stat: statFn } = await import("node:fs/promises");
        for (const file of jsonFiles) {
          try {
            const s = await statFn(join(codexSessionDir, file));
            const delta = Math.abs(s.birthtimeMs - sessionStart);
            if (delta < bestDelta) {
              bestDelta = delta;
              bestFile = file;
            }
          } catch { continue; }
        }

        // Only trust match if within 30s of session start
        if (bestFile && bestDelta < 30_000) {
          const s = await statFn(join(codexSessionDir, bestFile));
          const idleMs = Date.now() - s.mtimeMs;
          if (idleMs > threshold) return { state: "idle" };
          return { state: "active" };
        }
      } catch {
        // ~/.codex/sessions/ doesn't exist or not readable
      }

      // Fallback: unknown
      return null;
    },

    async isProcessRunning(handle: RuntimeHandle): Promise<boolean> {
      try {
        if (handle.runtimeName === "tmux" && handle.id) {
          const { stdout: ttyOut } = await execFileAsync(
            "tmux",
            ["list-panes", "-t", handle.id, "-F", "#{pane_tty}"],
            { timeout: 30_000 },
          );
          const ttys = ttyOut
            .trim()
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean);
          if (ttys.length === 0) return false;

          const { stdout: psOut } = await execFileAsync("ps", ["-eo", "pid,tty,args"], {
            timeout: 30_000,
          });
          const ttySet = new Set(ttys.map((t) => t.replace(/^\/dev\//, "")));
          const processRe = /(?:^|\/)codex(?:\s|$)/;
          for (const line of psOut.split("\n")) {
            const cols = line.trimStart().split(/\s+/);
            if (cols.length < 3 || !ttySet.has(cols[1] ?? "")) continue;
            const args = cols.slice(2).join(" ");
            if (processRe.test(args)) {
              return true;
            }
          }
          return false;
        }

        const rawPid = handle.data["pid"];
        const pid = typeof rawPid === "number" ? rawPid : Number(rawPid);
        if (Number.isFinite(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
            return true;
          } catch (err: unknown) {
            if (err instanceof Error && "code" in err && err.code === "EPERM") {
              return true;
            }
            return false;
          }
        }

        return false;
      } catch {
        return false;
      }
    },

    async getSessionInfo(session: Session): Promise<AgentSessionInfo | null> {
      // Codex stores sessions in ~/.codex/sessions/
      // Try to find session data and extract useful info
      const codexSessionDir = join(homedir(), ".codex", "sessions");
      try {
        const entries = await readdir(codexSessionDir);
        // Find most recent session file that could belong to this workspace
        const jsonFiles = entries.filter(f => f.endsWith(".json"));
        if (jsonFiles.length === 0) return null;

        // Sort by name descending (Codex uses timestamp-based names)
        jsonFiles.sort().reverse();

        for (const file of jsonFiles.slice(0, 5)) {
          try {
            const content = await readFile(join(codexSessionDir, file), "utf-8");
            const data = JSON.parse(content);
            // Match by workspace path if available
            if (data.workspace && session.workspacePath &&
                !data.workspace.includes(session.workspacePath)) continue;

            return {
              summary: data.summary || data.last_message || null,
              totalCost: data.total_cost ? { usd: data.total_cost } as CostEstimate : null,
              totalTokens: data.total_tokens || null,
            };
          } catch {
            continue;
          }
        }
      } catch {
        // ~/.codex/sessions/ doesn't exist
      }
      return null;
    },

    async setupWorkspaceHooks(workspacePath: string, _config: WorkspaceHooksConfig): Promise<void> {
      await setupCodexWorkspace(workspacePath);
    },

    async postLaunchSetup(session: Session): Promise<void> {
      if (!session.workspacePath) return;
      await setupCodexWorkspace(session.workspacePath);
    },
  };
}

// =============================================================================
// Plugin Export
// =============================================================================

export function create(): Agent {
  return createCodexAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
