// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ICaseManager, CaseView} from "./interfaces/ICaseManager.sol";
import {ISignalRegistry, Signal} from "./interfaces/ISignalRegistry.sol";
import {IParticipantRegistry} from "./interfaces/IParticipantRegistry.sol";

/// @title CaseManager - a bank's on-chain record that it used a signal.
/// Only banks open cases, only on signals that exist and have not expired,
/// and only one case per (signal, bank, payment reference). Opening a case
/// locks the provider's stake against withdrawal until settlement.
contract CaseManager is AccessControl, ICaseManager {
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE"); // RewardPool

    ISignalRegistry public immutable signalRegistry;
    IParticipantRegistry public immutable registry;
    address public immutable stakeVault;

    uint256 public override nextCaseId = 1;
    mapping(uint256 => CaseView) private _cases;
    mapping(bytes32 => bool) private _caseKeySeen; // keccak256(signalId, bank, paymentRef)

    event CaseOpened(
        uint256 indexed caseId,
        uint256 indexed signalId,
        address indexed bank,
        address provider,
        bytes32 paymentRef,
        uint256 amountAtRisk,
        uint64 openedAt
    );
    event CaseSettled(uint256 indexed caseId);

    constructor(address signalRegistry_, address registry_, address stakeVault_) {
        signalRegistry = ISignalRegistry(signalRegistry_);
        registry = IParticipantRegistry(registry_);
        stakeVault = stakeVault_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Record that the bank used a signal for a specific payment.
    /// @param paymentRef an opaque reference to the held payment (no personal data).
    function openCase(uint256 signalId, bytes32 paymentRef, uint256 amountAtRisk) external returns (uint256 caseId) {
        require(registry.hasRole(registry.BANK_ROLE(), msg.sender), "CaseManager: caller is not a bank");
        require(signalId < signalRegistry.nextSignalId(), "CaseManager: no such signal");

        Signal memory signal = signalRegistry.signals(signalId);
        require(block.timestamp < signal.expiry, "CaseManager: signal expired");

        bytes32 key = keccak256(abi.encodePacked(signalId, msg.sender, paymentRef));
        require(!_caseKeySeen[key], "CaseManager: case already exists for this payment");

        _caseKeySeen[key] = true;
        caseId = nextCaseId++;
        _cases[caseId] = CaseView({
            caseId: caseId,
            signalId: signalId,
            bank: msg.sender,
            provider: signal.provider,
            paymentRef: paymentRef,
            amountAtRisk: amountAtRisk,
            openedAt: uint64(block.timestamp),
            settled: false
        });

        IStakeCases(stakeVault).caseOpened(signal.provider);
        emit CaseOpened(caseId, signalId, msg.sender, signal.provider, paymentRef, amountAtRisk, uint64(block.timestamp));
    }

    /// @notice Mark a case settled; called only by the RewardPool.
    function markSettled(uint256 caseId) external onlyRole(SETTLER_ROLE) {
        require(caseId < nextCaseId, "CaseManager: no such case");
        require(!_cases[caseId].settled, "CaseManager: case already settled");
        _cases[caseId].settled = true;
        emit CaseSettled(caseId);
    }

    function cases(uint256 caseId) external view override returns (CaseView memory) {
        require(caseId < nextCaseId, "CaseManager: no such case");
        return _cases[caseId];
    }
}

interface IStakeCases {
    function caseOpened(address provider) external;
}
