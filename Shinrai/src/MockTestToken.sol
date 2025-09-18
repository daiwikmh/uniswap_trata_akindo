// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockTestToken
 * @notice Mock ERC20 token for testing Shinrai Protocol
 * @dev Allows unlimited minting for testing purposes
 */
contract MockTestToken is ERC20, Ownable {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        address owner
    ) ERC20(name, symbol) Ownable(owner) {
        _decimals = decimals_;

        // Mint initial supply to deployer
        _mint(owner, 1000000 * 10**decimals_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint tokens to any address (for testing)
     * @param to Address to mint tokens to
     * @param amount Amount to mint (in wei)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from any address (for testing)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burnFrom(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /**
     * @notice Mint tokens to caller (public minting for testing)
     * @param amount Amount to mint
     */
    function publicMint(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    /**
     * @notice Faucet function - gives 1000 tokens to caller
     */
    function faucet() external {
        _mint(msg.sender, 1000 * 10**_decimals);
    }
}