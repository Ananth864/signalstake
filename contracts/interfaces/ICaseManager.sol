// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

struct CaseView {
    uint256 caseId;
    uint256 signalId;
    address bank;
    address provider;
    bytes32 paymentRef;
    uint256 amountAtRisk;
    uint64 openedAt;
    bool settled;
}

interface ICaseManager {
    function cases(uint256 caseId) external view returns (CaseView memory);
    function nextCaseId() external view returns (uint256);
    function markSettled(uint256 caseId) external;
}
