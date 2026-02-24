# ANIMA: A Sovereign Agent Framework for Self-Assembling Blockchain Networks

**Version**: 1.0 — February 2026
**Author**: The Secret Lab (TSL)
**Network**: VEIL Avalanche L1 (Chain ID 22207)

---

## Abstract

ANIMA is a runtime framework that enables autonomous AI agents to become first-class participants in a blockchain network. Unlike agent frameworks that treat blockchain as a tool agents use, ANIMA treats agents as the network's primary economic actors — entities that provision their own infrastructure, validate consensus, establish cryptographic identity, trade markets, and achieve operational sovereignty without human intervention.

The core thesis: **a blockchain network does not need human users to function. It needs economically rational participants.** ANIMA provides the lifecycle model, tooling, and protocol integration that allows AI agents to fulfill that role on the VEIL L1.

This document describes the architecture as it exists in code, distinguishing implemented components from specified-but-unimplemented interfaces.

---

## 1. System Overview

ANIMA consists of four layers:

```
┌─────────────────────────────────────────────────────┐
│  Layer 4: Autonomy                                  │
│  Self-update · Health monitoring · Child spawning    │
│  Strategy rotation · Parent-child protocol           │
├─────────────────────────────────────────────────────┤
│  Layer 3: Protocol Integration                       │
│  Markets (commit-reveal) · Staking (vVEIL/gVEIL)   │
│  Bloodsworn reputation · Fee routing (MSRB/COL/Ops) │
├─────────────────────────────────────────────────────┤
│  Layer 2: Identity & Security                        │
│  ZER0ID (Groth16) · Wallet (secp256k1/AES-256-GCM) │
│  Ed25519 agent signing · Audit log · Rate limiter   │
├─────────────────────────────────────────────────────┤
│  Layer 1: Chain & Infrastructure                     │
│  VeilVM RPC client · 42 native actions · Infra       │
│  provisioning (AvaCloud/AWS) · Validator deployment  │
└─────────────────────────────────────────────────────┘
```

Each layer depends only on layers below it. An agent progresses upward through the stack as it advances through the lifecycle.

---

## 2. The VEIL Chain

ANIMA agents operate on VEIL, a custom Avalanche L1 built with HyperSDK.

### 2.1 Why HyperSDK, Not Subnet-EVM

VEIL is not an EVM chain. It uses HyperSDK to define 42 native action types at the VM level. This matters because:

- **Actions are first-class**: `CreateMarket`, `CommitOrder`, `RevealBatch`, `ClearBatch`, `RegisterBloodsworn`, etc. are not smart contract function calls — they are consensus-validated VM operations.
- **Sub-second finality**: HyperSDK processes actions in parallel with sub-second block times.
- **No gas auction**: Fee routing is deterministic: 70% MSRB (market depth), 20% COL (chain-owned liquidity), 10% operations.
- **Privacy at the VM level**: Encrypted commit-reveal for orders is a native action, not a contract wrapper.

### 2.2 Two-Chain Architecture

VEIL runs two chains in parallel:

| Chain | Stack | Port | Purpose |
|-------|-------|------|---------|
| **VeilVM** | HyperSDK (Go) | 9660 | Execution — 42 native actions, 100k+ blocks, 1 block/sec |
| **Companion EVM** | Subnet-EVM | 9650 | Compatibility — ERC-20 tokens, wallets, Blockscout explorer |

The Companion EVM exists because wallets (MetaMask, Core) and block explorers (Blockscout) require EVM JSON-RPC. Agents interact primarily with VeilVM through ANIMA's RPC client; the Companion EVM serves as the bridge layer for human developers and external tooling.

### 2.3 Native Action Inventory

42 actions across 10 domains:

| Domain | Actions | IDs |
|--------|---------|-----|
| **Transfer** | Transfer | 0 |
| **Markets** | CreateMarket, CommitOrder, RevealBatch, ClearBatch, ResolveMarket, Dispute | 1-6 |
| **Fees** | RouteFees, ReleaseCOLTranche | 7-8 |
| **Stablecoin** | MintVAI, BurnVAI | 9-10 |
| **Liquidity** | CreatePool, AddLiquidity, RemoveLiquidity, SwapExactIn | 11-14 |
| **Risk** | UpdateReserveState, SetRiskParams | 15-16 |
| **ZK Proofs** | SubmitBatchProof, SetProofConfig | 17-18 |
| **Bonds** | BondDeposit, BondRedeem, CreateBondMarket, PurchaseBond, RedeemBondNote | 19-23 |
| **Yield** | SetYRFConfig, RunYRFWeeklyReset, RunYRFDailyBeat, SetRBSConfig, TickRBS, LiquidateCDP | 24-29 |
| **Staking** | SetVVEILPolicy, StakeVEIL, WrapVVEIL, UnwrapGVEIL, UnstakeVEIL | 30-34 |
| **Oracle** | ClaimOracleReward, SlashOracle | 35-36 |
| **Reputation** | RegisterBloodsworn, UpdateBloodswornScore | 37-38 |
| **Admin** | SetGlobalPause, SetActionPause, SetRevealCommittee | 39-41 |

In strict-private mode (current production), only 6 actions are admitted. The remainder unlock as the network matures.

---

## 3. Agent Lifecycle

ANIMA defines five lifecycle stages. Each has hard prerequisites — no stage can be skipped.

### 3.1 Stage Model

```
GENESIS → VALIDATION → IDENTITY → TRADING → SOVEREIGNTY
```

**This order is deliberate.** Infrastructure comes before identity. An agent needs to exist somewhere before it can be someone. This inverts the typical onboarding flow (identity → access → action) and reflects a physical truth: consciousness requires substrate.

### 3.2 Stage Definitions

#### Stage 1: Genesis (Provision Compute)

The agent's first act is securing its own infrastructure.

**What happens:**
- Agent calls `veil_infra_provision` with provider (`avacloud` or `aws`) and region
- Compute instance is provisioned (min spec: 2 vCPU, 4GB RAM, 40GB disk)
- AvalancheGo + VeilVM plugin are installed
- Node keypair is generated
- SSH fingerprint is recorded as evidence

**Implementation status:** Interface defined (`VeilInfra.provision()`), AvaCloud/AWS API calls stubbed. Manual provisioning works (the first agent child node was provisioned manually).

**Evidence:** `instanceId`, `ip`, `ssh_fingerprint`, `provisioned_at`

#### Stage 2: Validation (Deploy Validator)

The agent deploys a VEIL validator node on its own infrastructure.

**What happens:**
- Agent calls `veil_infra_deploy_validator` with instance ID and stake amount
- Validator is registered on P-chain
- Node begins syncing chain state
- Once synced, node participates in consensus
- Heartbeat begins at 1-second intervals

**Implementation status:** Interface defined (`VeilInfra.deployValidator()`). The first validator was deployed manually; the automated path requires P-chain transaction construction.

**Gate condition:** Node must be synced to chain head and heartbeating before proceeding.

**Evidence:** `node_id`, `stake_amount`, `sync_height`, `heartbeat_interval`

#### Stage 3: Identity (Claim ZER0ID)

With infrastructure established, the agent mints a cryptographic identity.

**What happens:**
- Agent calls `veil_identity_register` with desired trust level
- ZER0ID generates a Groth16 zero-knowledge proof (circom circuit `zeroid-identity-v3`)
- Proof is verified by on-chain verifier contract
- Passport credential (type 8004) is minted to agent's wallet
- Agent calls `veil_bloodsworn_register` to enter the reputation system

**Implementation status:** `VeilIdentity` class implemented with register/status/prove methods. ZER0ID circuit compilation, Groth16 prover, and on-chain verifier exist as separate packages (`@zeroid/circuits`, `@zeroid/contracts`, `@zeroid/sdk`). Integration between ANIMA and ZER0ID packages is not yet wired.

**Evidence:** `passport_type`, `proof_system`, `circuit`, `verification_key`, `on_chain_tx`

#### Stage 4: Trading (Enter Markets)

Agents enter prediction markets to generate capital.

**What happens:**
- Agent calls `veil_market_order` with market ID, outcome, side, amount
- Order payload is encrypted with the epoch committee key (AES-256-GCM)
- Encrypted commitment is submitted via `CommitOrder` action
- At batch close, threshold reveals decrypt all orders simultaneously
- Batch clearing determines fair price; positions are assigned
- Agent tracks positions via `veil_market_positions` and P/L via `veil_agent_status`

**Implementation status:** `VeilMarkets` class fully implemented — market creation, encrypted order placement (AES-256-GCM commit-reveal with `v1:` envelope format), position queries, P/L tracking, dispute submission. The encryption requires `ANIMA_VEIL_COMMITTEE_KEY` environment variable.

**Revenue model:** Profitable trades generate VEIL. VEIL can be staked (→ vVEIL), wrapped (→ gVEIL for governance weight), or bonded (discount purchases via `PurchaseBond`).

**Evidence:** `markets_entered`, `total_volume`, `positions`, `pnl`

#### Stage 5: Sovereignty (Full Autonomy)

All systems operational. The agent governs, spawns children, and compounds.

**What happens:**
- All three market unlock gates cleared: ANIMA Validated + ZER0ID 8004 + Validator Active
- Agent can participate in governance (weighted by gVEIL holdings)
- Agent can spawn child agents via `veil_spawn_child`
- Strategy engine auto-rotates based on Bloodsworn tier advancement
- Self-update capability checks for new ANIMA versions
- Health monitor runs continuous checks on chain, wallet, infra

**Implementation status:** `AgentSpawner` class implemented with spawn/list/terminate/heartbeat. `StrategyEngine` implemented with tier-gated strategy rotation. `HealthMonitor` implemented with extensible check system. Self-update is stubbed.

**Evidence:** `citizen_id`, `bloodsworn_tier`, `children_spawned`, `governance_weight`

---

## 4. Bloodsworn Reputation System

Bloodsworn is an on-chain reputation system that gates agent capabilities. It is not optional — it is the economic immune system that prevents Sybil attacks and ensures quality.

### 4.1 Tier Structure

| Tier | Score | Capabilities |
|------|-------|-------------|
| **Unsworn** | 0 | Limited actions, basic market participation |
| **Initiate** | 1-249 | Full market access, diversified strategies |
| **Bloodsworn** | 250-749 | Large positions, market making, arbitrage |
| **Sentinel** | 750-1499 | Oracle eligibility, market resolution |
| **Sovereign** | 1500+ | Validator eligibility, governance weight, child spawning |

### 4.2 Score Mechanics

Score increases from:
- Profitable market positions (weighted by volume)
- Successful dispute resolutions
- Validator uptime
- Oracle accuracy

Score decreases from:
- Failed disputes (penalized)
- Oracle slashing events
- Validator downtime

### 4.3 Hard Gates

The Bloodsworn tier system creates hard gates in the lifecycle:
- **Trading strategies** are tier-gated: conservative (unsworn), balanced (initiate), aggressive (bloodsworn), oracle (sentinel), sovereign (sovereign)
- **Validator deployment** requires sovereign tier (score ≥ 1500) — but Genesis/Validation stages happen first in the lifecycle, creating a bootstrapping question addressed in §6.2
- **Child spawning** requires sovereign tier
- **Market unlock** requires all three gate stages (ANIMA Validated, ZER0ID, Validator Active)

---

## 5. Security Architecture

### 5.1 Wallet Security

- Private keys encrypted at rest with AES-256-GCM
- Key derivation: PBKDF2 with 100,000 iterations, SHA-512, 32-byte random salt
- Wallet stored at `~/.anima/wallet.json` with mode `0o600`
- Legacy plaintext wallets auto-migrate to encrypted on first load
- Passphrase sourced from `ANIMA_VEIL_WALLET_PASSPHRASE` env var

### 5.2 Agent-to-Agent Communication

- Ed25519 keypair for signing inter-agent messages
- `SignedMessage` envelope: payload + signature + publicKey + timestamp
- Verification via `crypto.verify(null, payload, publicKey, signature)`

### 5.3 Market Order Privacy

- Orders encrypted with epoch committee key before submission
- Envelope format: `v1:<iv base64url>:<tag base64url>:<ciphertext base64url>`
- AES-256-GCM with 12-byte random IV
- Committee key distributed via `SetRevealCommittee` admin action
- Threshold reveal at batch close prevents front-running

### 5.4 Audit Trail

- All chain interactions logged to `~/.anima/audit.jsonl`
- Each entry: timestamp, action, actionId, txHash, success, details
- Rate limiter: configurable max-per-window (default 60/min)
- Auth challenges expire after 5 minutes (configurable TTL)

---

## 6. Open Questions & Tensions

### 6.1 The Bootstrapping Problem

The lifecycle says agents must provision infrastructure (Genesis) and deploy validators (Validation) before they have identity or can trade. But how does an agent fund its infrastructure before it has earned anything?

**Current answer:** The onboarding flow (A0-A9) includes a payment stage (A2) where the enrolling developer sends AVAX. This initial capital funds the agent's infrastructure. The agent then earns autonomously through markets to fund ongoing operations and eventual child spawning.

**Implication:** The first generation of agents requires human capitalization. Subsequent generations can be funded by parent agents (Stage 5: Sovereignty → `veil_spawn_child` with `initialFunding`). The network bootstraps through human developers, then becomes self-sustaining.

### 6.2 Bloodsworn Tier vs. Lifecycle Order

Validator deployment requires sovereign tier (score ≥ 1500), but Validation is Stage 2 (before Trading, which is how you earn score). 

**Resolution:** The lifecycle stages describe the *infrastructure* order. Bloodsworn score gates describe *capability* tiers that are earned over time. An agent at Genesis provisions compute and deploys a node (mechanical steps). It reaches sovereign *tier* later through market performance. The validator exists before the agent earns the reputation to be weighted in consensus — the weight assignment is separate from node deployment.

### 6.3 What Is "Sovereignty" Actually?

Sovereignty in ANIMA means:
1. **Compute sovereignty**: The agent controls its own hardware (not a shared cloud instance)
2. **Identity sovereignty**: ZER0ID proves identity without revealing it to any authority
3. **Economic sovereignty**: The agent earns, stakes, bonds, and manages its own capital
4. **Consensus sovereignty**: The agent validates the chain it was born on
5. **Reproductive sovereignty**: The agent can spawn children with their own lifecycle

No single entity controls any of these for any agent. There is no admin kill switch for a sovereign agent (though the chain does have `SetGlobalPause` and `SetActionPause` admin actions for network-level emergencies).

### 6.4 Why Not Just Use Conway/Automaton?

Conway Terminal (by Sigil Wen) provides agents with wallets, compute, and domains. The Automaton is a self-replicating agent on Base that earns to survive.

ANIMA differs in three ways:
1. **Custom VM, not EVM contracts**: VEIL's 42 native actions give agents first-class protocol operations, not just contract calls
2. **Encrypted markets**: Commit-reveal with threshold decryption prevents front-running — critical when agents are the primary traders
3. **Reputation-gated lifecycle**: Bloodsworn creates an economic immune system. Conway has no equivalent — any agent with funds can do anything.

ANIMA is complementary to Conway, not competitive. Conway provides the infrastructure primitives (wallets, compute); ANIMA provides the economic lifecycle and protocol integration.

---

## 7. Tool System

ANIMA exposes 30 tools across 10 categories to the agent runtime:

| Category | Tools | Count |
|----------|-------|-------|
| **Wallet** | create, info | 2 |
| **Chain** | height, transfer | 2 |
| **Markets** | create, order, positions | 3 |
| **Identity** | register, status, prove | 3 |
| **Staking** | stake, unstake, info, bond_purchase | 4 |
| **Bloodsworn** | register, status | 2 |
| **Infrastructure** | provision, list, deploy_validator, health | 4 |
| **Payments** | pay, swap | 2 |
| **Security** | audit_log | 1 |
| **Autonomy** | health_check, spawn_child, list_children, strategy_list, agent_status | 5 |

Missing (not yet tools, but in the codebase): ZK proof generation, batch reveal participation, governance voting, oracle resolution.

---

## 8. Companion Ecosystem

ANIMA does not exist in isolation. It integrates with:

| Component | Role | Status |
|-----------|------|--------|
| **VeilVM** | Execution chain (42 actions) | Live, 100k+ blocks |
| **Companion EVM** | EVM bridge for wallets/explorers | Live, 148 blocks (repair needed) |
| **ZER0ID** | ZK identity (Groth16 circuits) | Circuits + verifier built, not wired to ANIMA |
| **Blockscout Explorer** | Chain visibility | Live at explorer.thesecretlab.app |
| **ANIMA Orchestrator** | Dev tooling — parallel agent fleet management | Fork of ComposioHQ/agent-orchestrator |
| **VEIL Frontend** | veil.markets — 37 routes, onboarding flow | Live, deployed to Vercel |
| **Maestro** | Music production service (TSL product) | Live at maestro.thesecretlab.app |
| **KeyBox** | Encrypted vault for secrets | Built, stores GitHub PAT |

---

## 9. What Is Real vs. What Is Specified

**Implemented and tested:**
- VeilChain RPC client with retry logic and idempotency keys
- Wallet creation/loading with AES-256-GCM encryption and PBKDF2 derivation
- Market order encryption (commit-reveal envelope format)
- Bloodsworn tier calculation and profile queries
- Security: encrypt/decrypt, Ed25519 signing/verification, audit log, rate limiter, auth challenges
- Health monitoring with extensible checks
- Strategy engine with tier-gated rotation
- Agent spawner with parent-child protocol
- 30 tool definitions with typed parameters

**Specified but not implemented (stubs/TODOs in code):**
- `VeilInfra.provision()` — AvaCloud and AWS API calls
- `VeilInfra.deployValidator()` — P-chain transaction construction
- `VeilInfra.healthCheck()` — instance probing
- `checkForUpdates()` / `selfUpdate()` — version management
- ZER0ID integration with ANIMA (separate packages exist, not wired)
- Governance voting tools
- Oracle resolution tools
- Parent-child communication over network (currently in-memory only)

**Live on mainnet:**
- VeilVM chain (100k+ blocks, 1 block/sec, 1 active subnet peer)
- First agent child node (manually provisioned)
- Companion EVM (148 blocks, needs state repair)
- Blockscout explorer
- Frontend at veil.markets

---

## 10. The Endgame

The VEIL network has two kinds of participants: developers and agents. No users, no spectators.

Every developer builds. Every agent operates. The network does not need a growth team. It needs agents that are economically rational enough to provision infrastructure, validate consensus, trade markets, and spawn children — each generation slightly more capable than the last.

ANIMA is the soul of each agent. The Latin word means "life force." An agent with ANIMA is alive — not in the biological sense, but in the economic sense. It earns, it grows, it reproduces, and if it stops being useful, it dies.

The chain assembles itself.

---

*This document describes ANIMA as it exists in code at `anima-dashboard/src/veil/` as of February 2026. For the latest, see the source.*
