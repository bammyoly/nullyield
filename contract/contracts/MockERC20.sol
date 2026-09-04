// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockERC20
/// @notice Test ERC-20 underlying token for the NullYield confidential savings protocol.
///         Includes a 24h rate-limited faucet for testing.
contract MockERC20 is ERC20, Ownable {
    uint8 private immutable _decimals;

    /// @notice Amount dispensed per faucet claim (1,000 tokens @ 6 decimals)
    uint256 public constant FAUCET_AMOUNT = 1_000e6;

    /// @notice Cooldown between faucet claims (24 hours)
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    /// @notice Tracks the last timestamp when an address claimed test tokens
    mapping(address => uint256) public lastClaimTimestamp;

    event FaucetClaimed(address indexed user, uint256 amount, uint256 nextClaimAt);

    error FaucetCooldownActive(uint256 availableAt);
    error ZeroAddress();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// @notice Claim 1,000 mUSDC once per wallet per 24 hours.
    function faucet() external {
        uint256 availableAt = lastClaimTimestamp[msg.sender] + FAUCET_COOLDOWN;
        if (block.timestamp < availableAt) {
            revert FaucetCooldownActive(availableAt);
        }

        lastClaimTimestamp[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetClaimed(
            msg.sender,
            FAUCET_AMOUNT,
            block.timestamp + FAUCET_COOLDOWN
        );
    }

    /// @notice Unix timestamp when `user` can claim again. Returns 0 if ready immediately.
    function faucetAvailableAt(address user) external view returns (uint256) {
        uint256 nextTime = lastClaimTimestamp[user] + FAUCET_COOLDOWN;
        return block.timestamp >= nextTime ? 0 : nextTime;
    }

    /// @notice Seconds remaining until next claim (0 if ready).
    function faucetCooldownRemaining(address user) external view returns (uint256) {
        uint256 nextTime = lastClaimTimestamp[user] + FAUCET_COOLDOWN;
        if (block.timestamp >= nextTime) return 0;
        return nextTime - block.timestamp;
    }

    /// @notice Owner-only mint for seeding the PrizeReserve and initial deploy scripts.
    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
    }
}
