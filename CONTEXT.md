# SignalStake

A staked scam-warning exchange: providers (telcos, platforms) post scam-warning commitments on-chain backed by a stake, banks use them to hold risky payments, and outcomes are confirmed and settled by smart contract. Built for DBA5102 Blockchain, Option 1.

## Language

### Signals

**Signal**:
The canonical entity: a provider's on-chain scam-warning record, consisting of a commitment, a type and an expiry. Identified by `signalId`.
_Avoid_: Warning, alert, flag (use "scam warning" only in lay prose for the deck)

**Warning details**:
The private content of a signal (call metadata, risk type), shared off-chain with banks, never on-chain.
_Avoid_: Signal data, payload

**Commitment**:
A fingerprint of the warning details plus a secret nonce that fixes the details in time without revealing them.
_Avoid_: Hash, digest (too generic)

**Nonce**:
The secret random value a provider mixes into a commitment so it cannot be brute-forced or guessed.

**Signal type**:
The category of a signal (e.g. scam call, scam SMS, scam site), the only content clue stored on-chain.

**Expiry**:
The moment after which a signal can no longer be used to open a case.

### Participants

**Provider**:
A member (telco, website, platform) that posts signals and stakes a deposit to do so.
_Avoid_: Telco (too narrow — platforms are providers too), sender

**Bank**:
A member that checks signals at payment time, opens cases, and funds the reward pool.

**Confirmer**:
The independent member whose signature, alongside the bank's, settles a case outcome. The real-world entity (regulatory body or platform operator) is decided later; the prototype uses a dedicated placeholder account.

**Regulator**:
The governing member that approves and removes members and holds network settings.
_Avoid_: Admin, owner

### Stakes and settlement

**Stake**:
A provider's refundable deposit in MockSGD; signals require the stake to be at or above minStake.

**Reward**:
The amount paid to a provider from a bank's funded pool when a case settles PREVENTED.

**Slash**:
The amount taken from a provider's stake when a case settles FALSE_ALARM.
_Avoid_: Penalty, fine

**Case**:
A bank's on-chain record that it used a specific signal for a specific payment at risk. Identified by `caseId`.
_Avoid_: Dispute, hold (a hold is the bank's off-chain payment action; the case is the on-chain record)

**Outcome**:
The settled verdict of a case: PREVENTED or FALSE_ALARM. Requires bank plus confirmer agreement.

**Dispute window**:
The period after both confirmations during which the outcome can still be disputed before settlement.

**Settle**:
The automatic contract action that pays the reward or takes the slash for a case and updates reputation. A case settles exactly once.
_Avoid_: Payout, finalize (finalize is the step that closes the dispute window)

**Reward pool**:
The bank-funded balance from which rewards are paid.
_Avoid_: Escrow

**Accuracy score**:
A provider's public (correct, total) tally, updated only by settlement.
_Avoid_: Rating, reputation score

### Currency

**MockSGD**:
The ERC-20 test token standing in for a fiat-backed SGD stablecoin; the only settlement currency.
