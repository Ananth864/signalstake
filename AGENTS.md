# SignalStake: project brief for AI coding agents

> Put this file in the root of the code repo as `AGENTS.md` (Codex) or `CLAUDE.md` (Claude Code), the way the "Coding with AI Copilot" session showed.
> Group assignment: DBA5102 Blockchain, Option 1. Deadline: **Sun 18 Oct 2026, 11:59pm** (deck + 10-min video + code).

## What we are building
A **staked scam-warning exchange**. Telcos and websites ("providers") send scam warnings that banks use to hold risky payments. A smart contract:
- requires providers to **stake a deposit** before they can send warnings,
- records **warning commitments**: `C = keccak256(nonce || warningDetails)`, never raw data,
- lets banks **open a case** when they use a warning,
- needs the **bank plus a second confirmer** (police/regulator role) to confirm the outcome: `PREVENTED` or `FALSE_ALARM`,
- **settles automatically**: pays the reward from the bank's pool on PREVENTED, and takes part of the provider's deposit on FALSE_ALARM,
- keeps a public **accuracy score** per provider.

## Hard constraints
- **No personal data on-chain.** No names, phone numbers, account numbers or URLs; only hashes or commitments.
- Use pull-payments or checks-effects-interactions for all transfers; nothing loops over unbounded arrays.
- Keep it simple: no tokens to speculate on, no upgradeable proxies in the prototype (parameters live in a Settings contract).

## Contracts
| Contract | Functions | Rules |
|---|---|---|
| ParticipantRegistry | `addMember(addr, role)`, `removeMember(addr)` | Roles: REGULATOR, PROVIDER, BANK, CONFIRMER. Only REGULATOR adds or removes members. |
| Settings | `setParams(reward, slashAmount, minStake, disputeWindow, signalTTL)` | Only callable by a multisig/REGULATOR. Defaults: reward 200, slash 60, minStake 500, disputeWindow 2 days, signalTTL 2 hours (test units). |
| StakeVault | `depositStake(amount)`, `requestWithdraw()`, `withdraw()` after cooldown, `slash(provider, amount)` (internal or RewardPool only) | A provider below minStake can't post warnings. |
| SignalRegistry | `postSignal(commitHash, signalType, expiry)` returns `signalId`; stretch: `postBatchRoot(merkleRoot)` | Only a PROVIDER with enough stake; expiry no later than now + signalTTL. |
| CaseManager | `openCase(signalId, amountAtRisk)` returns `caseId` | Only a BANK; the signal must exist and not be expired; one case per (signal, bank, payment ref). |
| OutcomeOracle | `confirmOutcome(caseId, outcome)`, `dispute(caseId)` | Needs a BANK and a CONFIRMER to agree; dispute window applies; `finalize(caseId)` after the window. |
| RewardPool | `fundPool(amount)` (bank), `settle(caseId)` | PREVENTED: pay `reward` to the provider. FALSE_ALARM: slash `slashAmount`. **A case can't be settled twice.** |
| Reputation | `getScore(provider)` returns `(correct, total)` | Updated only by `settle()`. |
| MockSGD | `mint(to, amount)` (test only) | ERC-20. |

## Tests that must pass (each one is a demo moment)
Happy path:
1. Provider stakes → posts signal → bank opens case → bank + confirmer confirm PREVENTED → `settle` pays the reward; the accuracy score updates.
2. False alarm → `settle` slashes the deposit; the accuracy score drops.

Must be **rejected**:
3. A non-member posts a signal.
4. A provider below minStake posts a signal.
5. A bank opens a case on an **expired** signal.
6. An outcome is confirmed by the bank alone (no second confirmer) and someone tries to settle.
7. Settling the same case **twice**.
8. A provider withdraws its stake before the cooldown, or while it has open cases.
9. A non-regulator changes settings or adds members.

## Demo scenarios (video)
- **"Mdm Tan"**: the telco flags a 20-minute call from a number linked to a fake government official scam → she starts a S$40,000 transfer → the bank holds it → outcome PREVENTED → the telco is paid automatically.
- **False alarm**: a spammy provider flags a normal call → FALSE_ALARM → deposit slashed 
- **Dashboard**: warnings, cases, outcomes, payments, provider accuracy (read from contract events). One view for us the owners of the product, one view for the banks and one view for the telco.