// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ParticipantRegistry - the membership list of the permissioned network.
/// Roles: REGULATOR, PROVIDER, BANK, CONFIRMER. Only the regulator adds or
/// removes members. Every other contract checks roles through this registry.
contract ParticipantRegistry is AccessControl {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");
    bytes32 public constant CONFIRMER_ROLE = keccak256("CONFIRMER_ROLE");

    /// @dev Every address may hold at most one role. One role per member keeps
    /// the demo personas honest and the independence of confirmers visible.
    mapping(address => bytes32) public roleOf;

    event MemberAdded(address indexed member, bytes32 role);
    event MemberRemoved(address indexed member, bytes32 role);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGULATOR_ROLE, msg.sender);
        roleOf[msg.sender] = REGULATOR_ROLE;
    }

    function addMember(address member, bytes32 role) external onlyRole(REGULATOR_ROLE) {
        require(
            role == PROVIDER_ROLE || role == BANK_ROLE || role == CONFIRMER_ROLE || role == REGULATOR_ROLE,
            "ParticipantRegistry: unknown role"
        );
        require(roleOf[member] == bytes32(0), "ParticipantRegistry: already a member");
        _grantRole(role, member);
        roleOf[member] = role;
        emit MemberAdded(member, role);
    }

    function removeMember(address member) external onlyRole(REGULATOR_ROLE) {
        bytes32 role = roleOf[member];
        require(role != bytes32(0), "ParticipantRegistry: not a member");
        require(member != msg.sender, "ParticipantRegistry: regulator cannot remove itself");
        _revokeRole(role, member);
        roleOf[member] = bytes32(0);
        emit MemberRemoved(member, role);
    }

    function isMember(address member) external view returns (bool) {
        return roleOf[member] != bytes32(0);
    }
}
