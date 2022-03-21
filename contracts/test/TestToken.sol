pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor(address w1, address w2, address w3, address w4) ERC20("Test Token", "TEST") {
        _mint(msg.sender, 1000*10e18);
        _mint(w1, 1000*10e18);
        _mint(w2, 1000*10e18);
        _mint(w3, 1000*10e18);
        _mint(w4, 1000*10e18);
    }

    function getTokens(address wallet, uint256 amount) external {
        _mint(wallet, amount);
    }
}
