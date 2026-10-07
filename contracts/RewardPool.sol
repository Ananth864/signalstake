// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICaseManager, CaseView} from "./interfaces/ICaseManager.sol";
import {IParticipantRegistry} from "./interfaces/IParticipantRegistry.sol";
import {ISettings, Params} from "./interfaces/ISettings.sol";
import {IStakeActions} from "./interfaces/IStakeActions.sol";
import {IReputation} from "./interfaces/IReputation.sol";
import {IOutcomeOracle} from "./interfaces/IOutcomeOracle.sol";

/// @title RewardPool - automatic settlement of confirmed cases.
/// Banks fund their own pool. On PREVENTED the provider is paid the reward
/// from that bank's pool. On FALSE_ALARM the provider is slashed and the
/// slashed amount is credited back to the reporting bank's pool (the bank
/// bore the cost of processing the false alarm). A case settles exactly once.
contract RewardPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IParticipantRegistry public immutable registry;
    address public immutable settings;
    IStakeActions public immutable stakeVault;
    ICaseManager public immutable caseManager;
    IOutcomeOracle public immutable outcomeOracle;
    IReputation public immutable reputation;

    mapping(address => uint256) public poolOf; // per bank

    event PoolFunded(address indexed bank, uint256 amount);
    event CaseSettledPrevented(
        uint256 indexed caseId, address indexed provider, address indexed bank, uint256 reward
    );
    event CaseSettledFalseAlarm(
        uint256 indexed caseId, address indexed provider, address indexed bank, uint256 slashed
    );

    constructor(
        address token_,
        address registry_,
        address settings_,
        address stakeVault_,
        address caseManager_,
        address outcomeOracle_,
        address reputation_
    ) {
        token = IERC20(token_);
        registry = IParticipantRegistry(registry_);
        settings = settings_;
        stakeVault = IStakeActions(stakeVault_);
        caseManager = ICaseManager(caseManager_);
        outcomeOracle = IOutcomeOracle(outcomeOracle_);
        reputation = IReputation(reputation_);
    }

    /// @notice A bank tops up its reward pool (pull payment: approve first).
    function fundPool(uint256 amount) external {
        require(registry.hasRole(registry.BANK_ROLE(), msg.sender), "RewardPool: caller is not a bank");
        require(amount > 0, "RewardPool: zero amount");
        poolOf[msg.sender] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolFunded(msg.sender, amount);
    }

    /// @notice Settle a finalized case: pay the reward or take the slash.
    function settle(uint256 caseId) external nonReentrant {
        CaseView memory c = caseManager.cases(caseId);
        require(!c.settled, "RewardPool: case already settled");

        IOutcomeOracle.OutcomeState memory s = outcomeOracle.stateOf(caseId);
        require(s.status == IOutcomeOracle.Status.FINALIZED, "RewardPool: case not finalized");

        Params memory p = ISettings(settings).params();

        if (s.outcome == IOutcomeOracle.Outcome.PREVENTED) {
            require(poolOf[c.bank] >= p.reward, "RewardPool: bank pool underfunded");
            poolOf[c.bank] -= p.reward;
            caseManager.markSettled(caseId);
            stakeVault.caseClosed(c.provider);
            reputation.recordSettlement(c.provider, true);
            token.safeTransfer(c.provider, p.reward);
            emit CaseSettledPrevented(caseId, c.provider, c.bank, p.reward);
        } else {
            uint256 before = token.balanceOf(address(this));
            stakeVault.slash(c.provider, p.slashAmount, address(this));
            uint256 received = token.balanceOf(address(this)) - before;
            poolOf[c.bank] += received; // the bank that processed the false alarm is compensated
            caseManager.markSettled(caseId);
            stakeVault.caseClosed(c.provider);
            reputation.recordSettlement(c.provider, false);
            emit CaseSettledFalseAlarm(caseId, c.provider, c.bank, received);
        }
    }
}
