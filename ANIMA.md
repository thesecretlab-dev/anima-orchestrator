# ANIMA Orchestrator

> Forked from [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator) — adapted for VEIL sovereign agent infrastructure.

## What is this?

ANIMA Orchestrator manages fleets of AI coding agents working in parallel across the VEIL ecosystem. Each agent gets its own git worktree, its own branch, and its own PR. When CI fails, the agent fixes it. When reviewers leave comments, the agent addresses them.

This is part of the **ANIMA** developer toolkit — the sovereign agent framework for the VEIL Avalanche L1.

## VEIL Projects

| Project | Repo | Description |
|---------|------|-------------|
| **VeilVM** | `thesecretlab-dev/veilvm` | HyperSDK custom VM (42 native actions) |
| **Frontend** | `thesecretlab-dev/veil-frontend` | veil.markets — Next.js 15, 37 routes |
| **Contracts** | `thesecretlab-dev/veil-contracts` | Companion EVM Solidity contracts |
| **ANIMA Runtime** | `thesecretlab-dev/anima-runtime` | Agent lifecycle framework |
| **ZER0ID** | `thesecretlab-dev/zeroid` | ZK-SNARK identity (Groth16) |
| **Maestro** | `thesecretlab-dev/maestro` | Music production service |

## Quick Start

```bash
# Install
cd anima-orchestrator && bash scripts/setup.sh

# Use the ANIMA config
cp anima-orchestrator.yaml agent-orchestrator.yaml

# Launch
ao start

# Spawn an agent on a VEIL issue
ao spawn veil-frontend 42       # GitHub issue #42
ao spawn veilvm --adhoc "Fix consensus edge case in batch clearing"
ao spawn veil-contracts --adhoc "Add rate limiting to VeilBridgeMinter"
```

## Architecture

Same plugin-based architecture as upstream agent-orchestrator:

- **Runtime**: tmux (default), Docker, k8s
- **Agent**: Claude Code (default), Codex, Aider
- **Workspace**: git worktree isolation
- **Tracker**: GitHub Issues
- **Reactions**: Auto-fix CI failures, address review comments

## VEIL-Specific Agent Rules

Each project has embedded `agentRules` in `anima-orchestrator.yaml` that give agents context about:

- Chain ID (22207), VM architecture, key contracts
- Brand system (fonts, colors, component library)
- Build/test commands
- Deployment procedures
- Security constraints (hardened admin, consensus-critical code gates)

## Dashboard

```bash
ao dashboard    # Opens at http://localhost:3100
ao status       # CLI overview
```

## Links

- **VEIL**: [veil.markets](https://veil.markets)
- **The Secret Lab**: [thesecretlab.app](https://thesecretlab.app)
- **Upstream**: [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)
