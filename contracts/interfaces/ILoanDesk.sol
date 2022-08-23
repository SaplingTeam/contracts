// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface ILoanDesk {

    enum LoanApplicationStatus {
        NULL, 
        APPLIED,
        DENIED,
        OFFER_MADE,
        OFFER_ACCEPTED,
        OFFER_CANCELLED
    }

    struct LoanOffer {
        uint256 applicationId;
        address borrower;
        uint256 amount;
        uint256 duration;
        uint256 gracePeriod;
        uint256 installmentAmount;
        uint16 installments;
        uint16 apr;
        uint256 offeredTime;
    }

    function applicationStatus(uint256 appId) external view returns (LoanApplicationStatus);

    function loanOfferById(uint256 appId) external view returns (LoanOffer memory);

    function onBorrow(uint256 appId) external;
}