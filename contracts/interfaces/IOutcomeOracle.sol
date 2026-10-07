// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IOutcomeOracle {
    enum Outcome { NONE, PREVENTED, FALSE_ALARM }
    enum Status { OPEN, CONFIRMED, FINALIZED }

    struct OutcomeState {
        Outcome bankVote;
        Outcome confirmerVote;
        uint64 confirmedAt;
        Outcome outcome;
        Status status;
    }

    function stateOf(uint256 caseId) external view returns (OutcomeState memory);
}
