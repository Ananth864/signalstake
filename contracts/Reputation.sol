// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Reputation - each provider's public accuracy score.
/// Only the RewardPool writes, and only when a case settles.
contract Reputation is AccessControl {
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE"); // RewardPool

    struct Score {
        uint64 correct; // settled PREVENTED
        uint64 total;   // settled cases
    }

    mapping(address => Score) private _scores;

    event ScoreUpdated(address indexed provider, uint64 correct, uint64 total);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function recordSettlement(address provider, bool correct) external onlyRole(SETTLER_ROLE) {
        Score storage s = _scores[provider];
        s.total += 1;
        if (correct) s.correct += 1;
        emit ScoreUpdated(provider, s.correct, s.total);
    }

    function getScore(address provider) external view returns (uint64 correct, uint64 total) {
        Score memory s = _scores[provider];
        return (s.correct, s.total);
    }
}
