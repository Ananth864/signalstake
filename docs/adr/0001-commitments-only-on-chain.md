# Store commitments on-chain, never personal data

The obvious design — share the flagged phone number or URL on-chain so banks can match payments — is illegal and unsafe: hashed identifiers are brute-forceable (only ~100m Singapore mobile numbers, so `H(phone)` reverses), and PDPA treats hashed identifiers as personal data. We decided the chain stores only a commitment `C = keccak256(nonce ‖ warningDetails)` plus signal type and expiry; the details travel off-chain through a private provider→bank channel (simulated in-browser for the prototype). This satisfies the lecture-1 hiding property (high-entropy nonce) and keeps matching off the chain entirely.

## Consequences

- The chain cannot be used to look up who is at risk; banks match off-chain at payment time and record only that a signal was used (a case).
- Commit-reveal: a provider can later prove what it warned and when by revealing nonce and details against the on-chain commitment.
- The dashboard must render the off-chain channel explicitly as simulated, or the demo hides where the privacy actually lives.
