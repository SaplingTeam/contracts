// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPoolToken is IERC20 {

    function mint(address to, uint256 amount) external;

    function burn(address from, uint256 amount) external;

}