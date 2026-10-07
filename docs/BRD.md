# SignalStake — Business Requirements Document

Lightweight BRD synthesized from *Idea1_Deep_Dive.docx* and *Idea 1_AGENTS.md*.
Course: DBA5102 Blockchain, Option 1 (Blockchain Solution Development). Deadline: Sun 18 Oct 2026, 11:59pm.

## 1. Background & problem

Scams in Singapore unfold in steps: contact (call/SMS/fake site) → manipulation → the victim **transfers the money themselves** (81.8% of 2025 cases; S$913.1m lost). Telcos see the contact, banks see the payment, but nobody joins the two at payment time — the bank decides alone. Cross-sector sharing exists (UK Scam Signal, AFCX, COSMIC) but lacks a neutral incentive and accountability layer: nobody pays telcos for accurate warnings, nobody penalises spammy ones, and there is no tamper-proof record of who warned whom for Shared Responsibility Framework disputes.

## 2. Product statement

**SignalStake: a staked scam-warning exchange.** Telcos/platforms ("providers") post scam-warning commitments on a smart contract, staking a deposit for credibility. Banks check warnings at payment time, hold risky payments, and open cases on-chain. Outcomes (PREVENTED / FALSE_ALARM) are confirmed by the bank **plus an independent confirmer**, and the contract settles automatically: reward from the bank's pool on PREVENTED, partial deposit slash on FALSE_ALARM, with a public accuracy score per provider. **No personal data ever goes on-chain** — only commitments `C = keccak256(nonce ‖ warningDetails)`.

## 3. Objectives

1. Get telco/platform scam warnings to banks before the victim's payment goes through.
2. Reward accurate warnings and penalise false ones automatically.
3. Keep customer data off-chain and private.
4. Keep a tamper-proof record of who warned whom and when.
5. Keep false positives low (stakes + slashing + public accuracy).

## 4. Stakeholders & roles

| Role | Who | Wins | Gives |
|---|---|---|---|
| REGULATOR | MAS/IMDSPF | Live audit view, policy data | Approves members, holds settings |
| PROVIDER | Telcos, platforms | Rewards, SRF evidence | Stake deposit, detection feeds |
| BANK | Banks | Fewer losses (S$4.59 cost per S$1 fraud), SRF protection | Funds reward pool, pays rewards |
| CONFIRMER | Police/regulator | Accountability | Independent outcome confirmation |
| Network operator (us) | Group | Fee per settled case (business model) | Runs the network |

## 5. Scope

**In (prototype, this build):** 8 Solidity contracts (ParticipantRegistry, Settings, StakeVault, SignalRegistry, CaseManager, OutcomeOracle, RewardPool, Reputation, MockSGD) on a local/Hardhat network with a Sepolia deploy path; full test suite covering 2 happy paths + 7 rejection cases; a three-view demo dashboard (owner/regulator, bank, telco) reading contract events; simulated off-chain warning-detail channel.

**Out (this build):** real telco APIs, real payment rails, privacy-preserving matching (PSI/HMAC — future work), Merkle batch posting (stretch, design not blocked by it), token economics beyond fixed parameters, permissioned-chain deployment (noted for the deck: production = Hyperledger Besu).

**Out (this session, per user):** presentation deck and video.

## 6. Functional requirements (from AGENTS.md contract table)

- FR1 Membership: only REGULATOR adds/removes members with roles REGULATOR / PROVIDER / BANK / CONFIRMER.
- FR2 Settings: reward (200), slash (60), minStake (500), disputeWindow (2d), signalTTL (2h) — regulator-only.
- FR3 Staking: providers deposit; withdraw after cooldown, blocked with open cases; below minStake ⇒ cannot post.
- FR4 Signals: provider posts commitment + type + expiry (≤ now + signalTTL); no personal data on-chain.
- FR5 Cases: bank opens case on a live signal; one case per (signal, bank, payment ref).
- FR6 Outcomes: bank + CONFIRMER both confirm PREVENTED or FALSE_ALARM; dispute window; finalize after window.
- FR7 Settlement: pull-payment; PREVENTED pays reward from bank's funded pool; FALSE_ALARM slashes deposit; no double-settle.
- FR8 Reputation: (correct, total) per provider, updated only by settlement.
- FR9 Currency: mock SGD ERC-20 for testing.

## 7. Non-functional requirements & constraints

- **Privacy:** no names, phone numbers, account numbers or URLs on-chain; only hashes/commitments.
- **Security:** pull-payments or checks-effects-interactions; no unbounded loops; no upgradeable proxies in prototype (parameters in Settings); ReentrancyGuard on value paths.
- **Simplicity:** no speculative token; fixed params via Settings; OpenZeppelin AccessControl.
- **Verifiability:** every rejected action has a unit test (quality-of-solution criterion).

## 8. Success criteria

1. All 9 mandated test scenarios pass (2 happy paths, 7 rejections).
2. End-to-end demo runs: "Mdm Tan" prevented-scam path and false-alarm path, visible on the dashboard.
3. Code deploys cleanly to Sepolia when faucet ETH + deployer key are supplied.
4. Demo shows the three participant views reading live contract state/events.

## 9. Deliverables (course)

Deck, 10-min video, code, plus this BRD, CONTEXT.md glossary and ADRs as supporting material.
