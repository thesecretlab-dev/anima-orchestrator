# ANIMA Orchestrator

> Forked from [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator) — tailored for the VEIL sovereign agent ecosystem.

## What is this?

ANIMA Orchestrator manages fleets of AI coding agents working in parallel across all VEIL projects. Each agent gets its own git worktree, its own branch, and its own PR. When CI fails, the agent fixes it. When reviewers leave comments, the agent addresses them. When a contract deploy fails, the agent gets chain state context and retries.

Part of the **ANIMA** developer toolkit — the sovereign agent framework for the VEIL Avalanche L1 (Chain ID 22207).

## VEIL Ecosystem Projects

| Project | Prefix | Description |
|---------|--------|-------------|
| **VeilVM** | `veilvm-` | HyperSDK custom VM · 42 native actions · Go |
| **Frontend** | `veil-fe-` | veil.markets · Next.js 15 · 37 routes |
| **Contracts** | `veil-sol-` | Companion EVM · Foundry · Solidity |
| **ANIMA Runtime** | `anima-` | Agent lifecycle framework · TypeScript |
| **ZER0ID** | `zeroid-` | ZK-SNARK identity · Circom · Groth16 |
| **Maestro** | `maestro-` | Music production · thesecretlab.app |

## Quick Start

```bash
# Clone and install
git clone https://github.com/thesecretlab-dev/anima-orchestrator.git
cd anima-orchestrator && bash scripts/setup.sh

# Use the ANIMA config
cp anima-orchestrator.yaml agent-orchestrator.yaml

# Launch
ao start

# Spawn agents
ao spawn veil-frontend 42                           # GitHub issue #42
ao spawn veilvm --adhoc "Fix batch clearing edge case"
ao spawn veil-contracts --adhoc "Add rate limiting to bridge"
ao spawn veil-frontend --agent codex --adhoc "Optimize LCP"  # Use Codex instead of Claude
```

## Agent Support

| Agent | Status | Notes |
|-------|--------|-------|
| **Claude Code** | ✅ Full | Default. JSONL introspection, PostToolUse hooks, cost tracking |
| **Codex** | ✅ Enhanced | Activity detection, session introspection, `--full-auto` + `--quiet` |
| **Aider** | ✅ Upstream | Standard upstream support |

### Codex Improvements (ANIMA fork)

The Codex plugin has been enhanced beyond upstream:
- **Activity detection**: Codex-specific prompts, sandbox approvals, error/rate-limit detection
- **Session introspection**: Reads `~/.codex/sessions/` for cost and summary data
- **Activity state**: Matches sessions by birthtime proximity, tracks idle vs active
- **Launch flags**: `--quiet` for automation, `--cwd` for explicit working directory
- **Workspace docs**: ANIMA-specific AGENTS.md with Codex guidance

## Plugins

### Notifiers

| Plugin | Description |
|--------|-------------|
| `desktop` | Native OS notifications |
| `slack` | Slack webhook |
| `webhook` | Generic HTTP webhook |
| **`anima`** | ANIMA messaging layer (routes to Telegram, Discord, Signal, etc.) |

Configure the ANIMA notifier:
```bash
export ANIMA_NOTIFY_URL="http://localhost:3284/api/v1/message"
export ANIMA_NOTIFY_KEY="your-api-key"
export ANIMA_NOTIFY_CHANNEL="your-channel-id"
```

## VEIL-Specific Features

### Embedded Agent Rules

Each project has `agentRules` in the config that give agents deep context:
- **Frontend**: Brand system (fonts, colors, components), build/deploy commands, design tokens
- **Contracts**: Key addresses, security constraints, Foundry workflow, SDK sync requirements
- **VeilVM**: Consensus-critical code gates, Go test requirements, chain architecture
- **ZER0ID**: Circuit constraints, Groth16 workflow, privacy requirements

### Chain-Aware Reactions

Beyond standard CI/review reactions:
- **`deploy-failed`**: Sends chain state (RPC, gas, nonce) to the agent for debugging
- **`preview-ready`**: Notifies when Vercel preview is deployed for visual verification
- **`agent-stuck`**: 10-minute threshold, then escalates with priority

### Notification Routing

```yaml
urgent: [desktop, anima]   # Agent stuck, errored, needs input
action: [desktop, anima]   # PR ready to merge, deploy complete
warning: [anima]           # Auto-fix failed, retry exhausted
info: [anima]              # Summary, progress updates
```

## Architecture

Same plugin-based architecture as upstream (8 swappable slots):

```
Runtime (tmux/docker) → Agent (claude-code/codex) → Workspace (worktree)
    ↕                       ↕                            ↕
Tracker (github)     ← SCM (github PR/CI) →      Notifier (anima/desktop)
```

## Project Templates

See `examples/` for ready-to-use configs:
- `veil-frontend.yaml` — Full frontend agent rules with design tokens
- `veil-contracts.yaml` — Solidity agent rules with addresses and security constraints

## Links

- **VEIL**: [veil.markets](https://veil.markets)
- **Explorer**: [explorer.thesecretlab.app](https://explorer.thesecretlab.app)
- **The Secret Lab**: [thesecretlab.app](https://thesecretlab.app)
- **Upstream**: [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)
