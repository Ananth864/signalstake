// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ISignalRegistry, Signal} from "./interfaces/ISignalRegistry.sol";
import {IParticipantRegistry} from "./interfaces/IParticipantRegistry.sol";
import {ISettings} from "./interfaces/ISettings.sol";

/// @title SignalRegistry - the public record of scam-warning commitments.
/// A provider posts only C = keccak256(nonce || warningDetails) plus a type
/// and an expiry. No personal data ever touches this contract. A provider
/// below minStake cannot post; an expiry may not exceed now + signalTTL.
contract SignalRegistry is ISignalRegistry {
    IParticipantRegistry public immutable registry;
    ISettings public immutable settings;
    /// @dev stake check lives in StakeVault; a minimal interface avoids imports
    address public immutable stakeVault;

    uint256 public override nextSignalId = 1;
    mapping(uint256 => Signal) private _signals;

    event SignalPosted(
        uint256 indexed signalId,
        address indexed provider,
        bytes32 commitHash,
        uint8 signalType,
        uint64 postedAt,
        uint64 expiry
    );

    constructor(address registry_, address settings_, address stakeVault_) {
        registry = IParticipantRegistry(registry_);
        settings = ISettings(settings_);
        stakeVault = stakeVault_;
    }

    /// @notice Post a signal. commitHash = keccak256(nonce || warningDetails).
    function postSignal(bytes32 commitHash, uint8 signalType, uint64 expiry) external returns (uint256 signalId) {
        require(
            registry.hasRole(registry.PROVIDER_ROLE(), msg.sender),
            "SignalRegistry: caller is not a provider"
        );
        require(commitHash != bytes32(0), "SignalRegistry: empty commitment");
        require(signalType <= 2, "SignalRegistry: unknown signal type");
        require(
            IStakeView(stakeVault).stakeOf(msg.sender) >= settings.params().minStake,
            "SignalRegistry: stake below minimum"
        );
        require(expiry > block.timestamp, "SignalRegistry: expiry in the past");
        require(
            expiry <= block.timestamp + settings.params().signalTTL,
            "SignalRegistry: expiry beyond signalTTL"
        );

        signalId = nextSignalId++;
        _signals[signalId] = Signal({
            id: signalId,
            provider: msg.sender,
            commitHash: commitHash,
            signalType: signalType,
            postedAt: uint64(block.timestamp),
            expiry: expiry
        });
        emit SignalPosted(signalId, msg.sender, commitHash, signalType, uint64(block.timestamp), expiry);
    }

    function signals(uint256 id) external view override returns (Signal memory) {
        require(id < nextSignalId, "SignalRegistry: no such signal");
        return _signals[id];
    }
}

/// @dev Minimal read interface into StakeVault to avoid a circular import.
interface IStakeView {
    function stakeOf(address provider) external view returns (uint256);
}
