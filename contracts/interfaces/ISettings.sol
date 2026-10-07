// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

struct Params {
    uint256 reward;
    uint256 slashAmount;
    uint256 minStake;
    uint256 disputeWindow;
    uint256 signalTTL;
    uint256 withdrawCooldown;
}

interface ISettings {
    function params() external view returns (Params memory);
}
