// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IParticipantRegistry} from "./interfaces/IParticipantRegistry.sol";
import {ISettings} from "./interfaces/ISettings.sol";

/// @title StakeVault - provider deposits that back every signal.
/// Providers deposit MockSGD; a provider below minStake cannot post signals.
/// Withdrawal needs a cooldown period and zero open cases. Slashing is
/// executed only by the RewardPool when a case settles FALSE_ALARM.
contract StakeVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CASE_MGR_ROLE = keccak256("CASE_MGR_ROLE"); // CaseManager
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");   // RewardPool

    IERC20 public immutable token;
    IParticipantRegistry public immutable registry;
    ISettings public immutable settings;

    mapping(address => uint256) public stakeOf;
    mapping(address => uint256) public openCases;       // per provider
    mapping(address => uint256) public withdrawRequestAt; // 0 = not requested

    event Staked(address indexed provider, uint256 amount);
    event WithdrawalRequested(address indexed provider, uint256 at);
    event Withdrawn(address indexed provider, uint256 amount);
    event ProviderCaseOpened(address indexed provider);
    event ProviderCaseClosed(address indexed provider);
    event Slashed(address indexed provider, uint256 amount, address indexed creditedTo);

    constructor(address token_, address registry_, address settings_) {
        token = IERC20(token_);
        registry = IParticipantRegistry(registry_);
        settings = ISettings(settings_);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Deposit stake (pull payment: approve MockSGD first).
    function depositStake(uint256 amount) external {
        require(registry.hasRole(registry.PROVIDER_ROLE(), msg.sender), "StakeVault: not a provider");
        require(amount > 0, "StakeVault: zero amount");
        stakeOf[msg.sender] += amount;
        withdrawRequestAt[msg.sender] = 0; // a new deposit cancels a pending withdrawal
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function requestWithdraw() external {
        require(stakeOf[msg.sender] > 0, "StakeVault: nothing staked");
        withdrawRequestAt[msg.sender] = block.timestamp;
        emit WithdrawalRequested(msg.sender, block.timestamp);
    }

    /// @notice Withdraw the full stake after the cooldown and with no open cases.
    function withdraw() external nonReentrant {
        uint256 requestedAt = withdrawRequestAt[msg.sender];
        require(requestedAt != 0, "StakeVault: no withdrawal requested");
        require(
            block.timestamp >= requestedAt + settings.params().withdrawCooldown,
            "StakeVault: cooldown not elapsed"
        );
        require(openCases[msg.sender] == 0, "StakeVault: open cases pending");
        uint256 amount = stakeOf[msg.sender];
        require(amount > 0, "StakeVault: nothing staked");
        stakeOf[msg.sender] = 0;
        withdrawRequestAt[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Called by CaseManager when a bank opens a case on a provider's signal.
    function caseOpened(address provider) external onlyRole(CASE_MGR_ROLE) {
        openCases[provider] += 1;
        emit ProviderCaseOpened(provider);
    }

    /// @notice Called by RewardPool when a case settles.
    function caseClosed(address provider) external onlyRole(SETTLER_ROLE) {
        require(openCases[provider] > 0, "StakeVault: no open case");
        openCases[provider] -= 1;
        emit ProviderCaseClosed(provider);
    }

    /// @notice Take part of a provider's deposit after a FALSE_ALARM settlement.
    /// The slashed amount is transferred to `recipient` (the RewardPool, which
    /// credits the reporting bank's pool).
    function slash(address provider, uint256 amount, address recipient) external onlyRole(SETTLER_ROLE) {
        uint256 stake = stakeOf[provider];
        uint256 taken = amount > stake ? stake : amount;
        require(taken > 0, "StakeVault: nothing to slash");
        stakeOf[provider] = stake - taken;
        withdrawRequestAt[provider] = 0;
        token.safeTransfer(recipient, taken);
        emit Slashed(provider, taken, recipient);
    }
}
