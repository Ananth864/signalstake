# Settle in an ERC-20 mock SGD, not ETH

Rewards, stakes and slashes could be denominated in ETH — simpler, no token approvals — but lecture A12 warns against volatile settlement currency and algorithmic stablecoins (TerraUSD, ~US$40bn losses). We decided all value paths (StakeVault, RewardPool) use an ERC-20 mock SGD for the prototype, standing in for a fiat-backed SGD stablecoin in production. Fixed S$-denominated parameters (reward 200, slash 60, minStake 500) only make sense against a stable unit.

## Consequences

- Every transfer is a pull-payment over an allowance (contract moves tokens), which we guard with checks-effects-interactions and reentrancy protection.
- The deploy script must mint and distribute MockSGD to demo participants, or nothing can be staked or funded.
