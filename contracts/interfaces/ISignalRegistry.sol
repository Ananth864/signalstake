// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

struct Signal {
    uint256 id;
    address provider;
    bytes32 commitHash; // C = keccak256(nonce || warningDetails); details never on-chain
    uint8 signalType;   // 0 = scam call, 1 = scam SMS, 2 = scam site
    uint64 postedAt;
    uint64 expiry;
}

interface ISignalRegistry {
    function signals(uint256 id) external view returns (Signal memory);
    function nextSignalId() external view returns (uint256);
}
