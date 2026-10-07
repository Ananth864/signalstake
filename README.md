# SignalStake

A staked scam-warning exchange — DBA5102 Blockchain (NUS-ISS), Option 1.
Telcos and platforms ("providers") post scam-warning **commitments** on-chain backed by a stake; banks use them to hold risky payments; outcomes are confirmed by the bank **plus an independent confirmer**; the contract settles automatically — reward on PREVENTED, slash on FALSE_ALARM — and keeps a public accuracy score per provider. **No personal data ever goes on-chain.**

- Business case & research: `Idea1_Deep_Dive.docx` · Requirements: `docs/BRD.md` · Glossary: `CONTEXT.md` · Decisions: `docs/adr/`
- Agent brief: `AGENTS.md` (copied from `Idea 1_AGENTS.md`)

## Quick start (local demo)

```bash
npm install            # Hardhat + OpenZeppelin (root)
npm run node           # terminal 1 — local chain on 127.0.0.1:8545
npm run deploy:local   # terminal 2 — 9 contracts + demo members
npm run seed:local     # stake S$500, fund pool S$2,000, post the Mdm Tan signal

cd app && npm install && npm run dev   # terminal 3 — dashboard at http://localhost:5173
```

In the dashboard, switch personas (top bar) and run the story:
**Telco** composes a warning (details stay off-chain; only `C = keccak256(nonce ‖ details)` is posted) → **Bank** opens a case on a live signal and votes → **Confirmer** seconds the outcome → after the 5-minute dispute window anyone finalizes and settles → the telco is paid / slashed and the accuracy score updates.

Fast-forward time on the local chain (what the video demo does instead of waiting):

```bash
curl -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[301],"id":1}'
curl -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"evm_mine","params":[],"id":1}'
```

## Tests

```bash
npm test    # 17 tests: both happy paths + every mandated rejection (AGENTS.md list)
```

## Sepolia deployment

```bash
npm run new-burner    # writes a throwaway DEPLOYER_PRIVATE_KEY to .env, prints the address
# fund the printed address with Sepolia ETH (Google Cloud / Alchemy / QuickNode faucet,
# or the professor's 0.01-ETH form), then:
npm run deploy:sepolia
```

The deployer acts as the REGULATOR (the regulator bootstraps the network). Demo parameters are deliberately short (dispute window and withdraw cooldown 5 minutes, signal TTL 2 hours) so the live testnet flow is demonstrable in minutes; production values would use multi-day windows. The dashboard offers a read-only Sepolia view once `app/public/sepolia.json` exists.

## Layout

```
contracts/     9 Solidity contracts (Hardhat, Solidity 0.8.24, OpenZeppelin v5)
test/          17-test suite covering the AGENTS.md scenarios
scripts/       deploy.ts, seed.ts, new-burner.mjs
app/           Vite + React + viem dashboard (persona switcher, two-lane boundary layout)
docs/          BRD, ADRs
```

## Security posture (prototype scope)

Pull payments (ERC-20 approvals) with checks-effects-interactions and `ReentrancyGuard` on every value path; no unbounded loops (reads are capped at 30 rows client-side); parameters live in a regulator-gated `Settings` contract; no upgradeable proxies. Slashed funds refund the reporting bank's pool (ADR-0003).
