// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Settings - the network's tunable parameters, in one place.
/// Only the regulator can change them (a multisig would hold this in
/// production; the prototype keeps it simple, per the project brief).
///
/// Defaults are demo-friendly: a 5-minute dispute window and withdrawal
/// cooldown, a 2-hour signal TTL, reward 200 SGD, slash 60 SGD, min stake
/// 500 SGD. Production values would use a multi-day dispute window.
contract Settings is AccessControl {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    struct Params {
        uint256 reward;          // paid to the provider on PREVENTED
        uint256 slashAmount;     // taken from the provider on FALSE_ALARM
        uint256 minStake;        // stake required to post signals
        uint256 disputeWindow;   // seconds after confirmation before finalize
        uint256 signalTTL;       // max seconds a signal may be valid for
        uint256 withdrawCooldown; // seconds between requestWithdraw and withdraw
    }

    Params public params;

    event ParamsSet(Params params);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGULATOR_ROLE, msg.sender);
        params = Params({
            reward: 200 ether,
            slashAmount: 60 ether,
            minStake: 500 ether,
            disputeWindow: 5 minutes,
            signalTTL: 2 hours,
            withdrawCooldown: 5 minutes
        });
    }

    function setParams(Params calldata newParams) external onlyRole(REGULATOR_ROLE) {
        params = newParams;
        emit ParamsSet(newParams);
    }
}
