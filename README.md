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

**Deployed — all 9 contracts verified with code on-chain (regulator = `0x991a1A42D25A4ad4815e2Ac9BBB50288b48DFd5A`, key in `.env`):**

| Contract | Address |
|---|---|
| MockSGD | [0xd8906ca998517543C6Ff2302B6F0DFDF88B3281d](https://sepolia.etherscan.io/address/0xd8906ca998517543C6Ff2302B6F0DFDF88B3281d) |
| ParticipantRegistry | [0x5f1e3b44A179Efd19E183d44bEEDFF980072ba76](https://sepolia.etherscan.io/address/0x5f1e3b44A179Efd19E183d44bEEDFF980072ba76) |
| Settings | [0xb325b99789fF702c26288cDC86c64aDe9366CFd3](https://sepolia.etherscan.io/address/0xb325b99789fF702c26288cDC86c64aDe9366CFd3) |
| StakeVault | [0xC5202c8827fD38F7438409211e9CC3c2e9177Cf4](https://sepolia.etherscan.io/address/0xC5202c8827fD38F7438409211e9CC3c2e9177Cf4) |
| SignalRegistry | [0x44995e9A9BfFaFA875486385B828C24e54f3061D](https://sepolia.etherscan.io/address/0x44995e9A9BfFaFA875486385B828C24e54f3061D) |
| CaseManager | [0xB243a46a8DB4B2E2c3c04e3e64eD053655E09B74](https://sepolia.etherscan.io/address/0xB243a46a8DB4B2E2c3c04e3e64eD053655E09B74) |
| OutcomeOracle | [0x32fD8e91aB829aa5Bdf19A56cf800E76dC5A0b1f](https://sepolia.etherscan.io/address/0x32fD8e91aB829aa5Bdf19A56cf800E76dC5A0b1f) |
| Reputation | [0x17ad7546232D289E798F106160A25f0340919b33](https://sepolia.etherscan.io/address/0x17ad7546232D289E798F106160A25f0340919b33) |
| RewardPool | [0x5df68f7eEeC527759D50fd5a802f84606884261b](https://sepolia.etherscan.io/address/0x5df68f7eEeC527759D50fd5a802f84606884261b) |

To redeploy fresh (e.g. after another faucet drip): `npm run new-burner`, fund the printed address, then `npm run deploy:sepolia`. The dashboard offers a read-only Sepolia view once `app/public/sepolia.json` exists.

Notes for the demo: the local node hosts the full interactive flow (all four persona keys); on Sepolia only the regulator key is held, so new members are onboarded via `ParticipantRegistry.addMember` from the deployer wallet. Sepolia creation gas runs several times the local equivalent — the deploy scripts track nonces locally, pin fees, and size gas from the node's own simulation (see `scripts/deploy.ts`, `scripts/deploy-resume.ts`).

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
