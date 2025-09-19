// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockTestToken
 * @notice Mock ERC20 token for testing Shinrai Protocol
 * @dev Owner has privileged mint/burn, but public helpers exist for integration testing
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

        // Mint initial supply to deployer/owner
        _mint(owner, 1_000_000 * 10 ** decimals_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    // ========== Owner functions ==========

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    // ========== Testing helpers (open mint) ==========

    /**
     * @notice Anyone can mint tokens to themselves (testing only)
     */
    function publicMint(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    /**
     * @notice Anyone can mint tokens to any address (testing only)
     */
    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Faucet - mints default amount (1000 tokens) to caller
     */
    function faucet() external {
        _mint(msg.sender, 1000 * 10 ** _decimals);
    }
}
