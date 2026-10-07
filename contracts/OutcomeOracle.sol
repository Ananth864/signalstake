// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICaseManager, CaseView} from "./interfaces/ICaseManager.sol";
import {IParticipantRegistry} from "./interfaces/IParticipantRegistry.sol";
import {ISettings} from "./interfaces/ISettings.sol";

/// @title OutcomeOracle - the outcome-confirmation step.
/// A case's outcome (PREVENTED or FALSE_ALARM) needs the bank AND an
/// independent confirmer to submit the same verdict. After both agree, a
/// dispute window runs; the bank or the provider may dispute during it,
/// which resets the votes. Once the window passes, anyone can finalize.
contract OutcomeOracle {
    enum Outcome { NONE, PREVENTED, FALSE_ALARM }
    enum Status { OPEN, CONFIRMED, FINALIZED }

    struct OutcomeState {
        Outcome bankVote;
        Outcome confirmerVote;
        uint64 confirmedAt;  // when both votes agreed
        Outcome outcome;     // valid once CONFIRMED
        Status status;
    }

    ICaseManager public immutable caseManager;
    IParticipantRegistry public immutable registry;
    address public immutable settings;

    mapping(uint256 => OutcomeState) private _states;

    event OutcomeVoted(uint256 indexed caseId, address indexed voter, Outcome outcome, bool byBank);
    event OutcomeConfirmed(uint256 indexed caseId, Outcome outcome, uint64 confirmedAt);
    event OutcomeDisputed(uint256 indexed caseId, address indexed by);
    event CaseFinalized(uint256 indexed caseId, Outcome outcome);

    constructor(address caseManager_, address registry_, address settings_) {
        caseManager = ICaseManager(caseManager_);
        registry = IParticipantRegistry(registry_);
        settings = settings_;
    }

    modifier validOutcome(Outcome outcome) {
        require(outcome == Outcome.PREVENTED || outcome == Outcome.FALSE_ALARM, "OutcomeOracle: bad outcome");
        _;
    }

    /// @notice Submit a verdict. The case's bank votes as bank; CONFIRMER-role
    /// members vote as the independent second signature.
    function confirmOutcome(uint256 caseId, Outcome outcome) external validOutcome(outcome) {
        CaseView memory c = caseManager.cases(caseId);
        OutcomeState storage s = _states[caseId];
        require(s.status == Status.OPEN, "OutcomeOracle: case not open for votes");

        bool byBank = msg.sender == c.bank && registry.hasRole(registry.BANK_ROLE(), msg.sender);
        bool byConfirmer = registry.hasRole(registry.CONFIRMER_ROLE(), msg.sender);
        require(byBank || byConfirmer, "OutcomeOracle: not the bank or a confirmer");
        require(!byBank || !byConfirmer || msg.sender == c.bank, "OutcomeOracle: conflicted caller");
        // A confirmer must not be the bank of this case: the two signatures are independent.
        require(!(byConfirmer && msg.sender == c.bank), "OutcomeOracle: confirmer must differ from bank");

        if (byBank) {
            s.bankVote = outcome;
        } else {
            s.confirmerVote = outcome;
        }
        emit OutcomeVoted(caseId, msg.sender, outcome, byBank);

        if (s.bankVote == outcome && s.confirmerVote == outcome && outcome != Outcome.NONE) {
            s.outcome = outcome;
            s.confirmedAt = uint64(block.timestamp);
            s.status = Status.CONFIRMED;
            emit OutcomeConfirmed(caseId, outcome, s.confirmedAt);
        }
    }

    /// @notice Dispute during the window; resets both votes.
    function dispute(uint256 caseId) external {
        CaseView memory c = caseManager.cases(caseId);
        OutcomeState storage s = _states[caseId];
        require(s.status == Status.CONFIRMED, "OutcomeOracle: nothing confirmed to dispute");
        require(
            block.timestamp < s.confirmedAt + ISettings(settings).params().disputeWindow,
            "OutcomeOracle: dispute window closed"
        );
        require(
            msg.sender == c.bank || msg.sender == c.provider,
            "OutcomeOracle: only the bank or the provider can dispute"
        );

        s.bankVote = Outcome.NONE;
        s.confirmerVote = Outcome.NONE;
        s.confirmedAt = 0;
        s.outcome = Outcome.NONE;
        s.status = Status.OPEN;
        emit OutcomeDisputed(caseId, msg.sender);
    }

    /// @notice Anyone may finalize once the dispute window has passed.
    function finalize(uint256 caseId) external {
        OutcomeState storage s = _states[caseId];
        require(s.status == Status.CONFIRMED, "OutcomeOracle: not confirmed");
        require(
            block.timestamp >= s.confirmedAt + ISettings(settings).params().disputeWindow,
            "OutcomeOracle: dispute window still open"
        );
        s.status = Status.FINALIZED;
        emit CaseFinalized(caseId, s.outcome);
    }

    function stateOf(uint256 caseId) external view returns (OutcomeState memory) {
        return _states[caseId];
    }
}
