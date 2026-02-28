> **Note:** This package is now part of the [ANIMA monorepo](https://github.com/thesecretlab-dev/anima). See `packages/orchestrator/` for the latest code.

# ANIMA Orchestrator

**Parallel AI agent fleet management for the VEIL ecosystem.**

Spawn parallel coding agents across VEIL projects â€” each in its own git worktree. Agents autonomously fix CI failures, address review comments, handle chain deployment errors, and open PRs. You supervise from one dashboard.

Built on [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator), tailored for sovereign agent infrastructure.

## What It Does

- **Parallel execution** â€” Multiple agents working simultaneously across repos, each with isolated branches
- **CI auto-fix** â€” Agent detects failed CI, diagnoses the issue, pushes a fix
- **Review handling** â€” PR review comments trigger agent responses and code changes
- **Agent-agnostic** â€” Works with Claude Code, Codex, Aider, or custom agents
- **Runtime-agnostic** â€” tmux, Docker, or direct process management

## VEIL Integration

The orchestrator is configured for the full VEIL stack:

| Project | Agent Role |
|---------|-----------|
| `veilvm` | VM development, ZK pipeline, consensus changes |
| `veil-contracts` | Solidity development, Foundry tests, deployment scripts |
| `veil-frontend` | UI/UX, market pages, data integration |
| `zeroid` | Circom circuits, SDK, verifier contracts |
| `anima-runtime` | Agent lifecycle, chain integration |
| `veildb` | Storage layer, OrbitDB operations |

See [ANIMA.md](./ANIMA.md) for VEIL-specific setup and features.

## Quick Start

```bash
git clone https://github.com/thesecretlab-dev/anima-orchestrator.git
cd anima-orchestrator
npm install
npm start
```

## Ecosystem

| Component | Repo |
|-----------|------|
| Agent Runtime | [anima-runtime](https://github.com/thesecretlab-dev/anima-runtime) |
| Agent Dashboard | [anima-dashboard](https://github.com/thesecretlab-dev/anima-dashboard) |
| Chain (VeilVM) | [veilvm](https://github.com/thesecretlab-dev/veilvm) |

---

*Deploy agents. Ship code. Sleep.*

