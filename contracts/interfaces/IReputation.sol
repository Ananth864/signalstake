// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IReputation {
    function recordSettlement(address provider, bool correct) external;
    function getScore(address provider) external view returns (uint64 correct, uint64 total);
}
