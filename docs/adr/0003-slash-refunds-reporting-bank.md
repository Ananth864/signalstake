# Slashed deposits refund the reporting bank

When a case settles FALSE_ALARM, the slashed amount could have been burned, sent to a regulator treasury, or returned to the provider after a cooldown. We decided the slash is transferred to the RewardPool and credited to the pool of the bank that processed the false alarm. Rationale: the bank bore the real cost of the false alarm (payment hold, customer call-back, staff time), and refunding it keeps the pool from draining when providers are sloppy — the bank stays willing to keep checking signals.

## Considered options

- Burn the slash: simple, but destroys value and drains the network's settlement capacity.
- Regulator treasury: politically clean, but adds a withdrawal role and an entity the prototype does not otherwise need.
- Refund the reporting bank (chosen): compensates the party that carried the cost and keeps incentives aligned.
