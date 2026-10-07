// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IStakeActions {
    function caseClosed(address provider) external;
    function slash(address provider, uint256 amount, address recipient) external;
}
