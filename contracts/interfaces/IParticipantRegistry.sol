// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IParticipantRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function roleOf(address member) external view returns (bytes32);
    function PROVIDER_ROLE() external view returns (bytes32);
    function BANK_ROLE() external view returns (bytes32);
    function CONFIRMER_ROLE() external view returns (bytes32);
    function REGULATOR_ROLE() external view returns (bytes32);
}
