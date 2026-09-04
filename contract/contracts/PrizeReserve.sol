// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ConfidentialToken} from "./ConfidentialToken.sol";

interface INullYield {
    function fundPrizeFromReserve(uint64 amount) external;
    function poolToken() external view returns (IERC7984);
}

/// @title PrizeReserve
/// @notice An admin-funded mock yield source that periodically tops up the
///         NullYield pool's encrypted prize reserve.
contract PrizeReserve is ZamaEthereumConfig, Ownable2Step, ReentrancyGuard {
    IERC20 public immutable erc20;
    ConfidentialToken public immutable confidentialToken;
    INullYield public immutable nullYield;

    // Distribution parameters
    uint64 public distributionAmount;     // tokens per distribution (plaintext, 6 decimals)
    uint256 public distributionInterval;  // seconds between distributions
    uint256 public lastDistributionTime;

    // Keeper authorized to trigger distributions
    address public keeper;

    event ReserveFunded(address indexed funder, uint256 amount);
    event Distributed(uint256 indexed timestamp, uint64 amount);
    event DistributionParamsUpdated(uint64 amount, uint256 interval);
    event KeeperUpdated(address indexed keeper);

    error InsufficientReserve();
    error DistributionNotDue();
    error ZeroDistribution();
    error NotAuthorizedKeeper();

    modifier onlyKeeperOrOwner() {
        if (msg.sender != keeper && msg.sender != owner()) revert NotAuthorizedKeeper();
        _;
    }

    constructor(
        IERC20 erc20_,
        ConfidentialToken confidentialToken_,
        INullYield nullYield_,
        uint64 distributionAmount_,
        uint256 distributionInterval_,
        address keeper_
    ) Ownable(msg.sender) {
        erc20 = erc20_;
        confidentialToken = confidentialToken_;
        nullYield = nullYield_;
        distributionAmount = distributionAmount_;
        distributionInterval = distributionInterval_;
        keeper = keeper_;
        lastDistributionTime = block.timestamp;

        // Approve ConfidentialToken wrapper to pull ERC-20 for shielding (wrapping)
        erc20_.approve(address(confidentialToken_), type(uint256).max);

        // Set NullYield as operator on ConfidentialToken so it can pull encrypted balances
        confidentialToken_.setOperator(address(nullYield_), type(uint48).max);
    }

    // ─────────────────────────────────────────────────────────────────
    // Funding
    // ─────────────────────────────────────────────────────────────────

    function fund(uint256 amount) external nonReentrant {
        require(amount > 0, "PrizeReserve: zero amount");
        require(
            erc20.transferFrom(msg.sender, address(this), amount),
            "PrizeReserve: transfer failed"
        );
        emit ReserveFunded(msg.sender, amount);
    }

    function fundAndDistribute(uint256 fundAmount) external nonReentrant onlyKeeperOrOwner {
        require(
            erc20.transferFrom(msg.sender, address(this), fundAmount),
            "PrizeReserve: transfer failed"
        );
        emit ReserveFunded(msg.sender, fundAmount);
        _distribute();
    }

    // ─────────────────────────────────────────────────────────────────
    // Distribution
    // ─────────────────────────────────────────────────────────────────

    function canDistribute() public view returns (bool) {
        return
            block.timestamp >= lastDistributionTime + distributionInterval &&
            erc20.balanceOf(address(this)) >= distributionAmount &&
            distributionAmount > 0;
    }

    function distribute() external nonReentrant onlyKeeperOrOwner {
        _distribute();
    }

    function _distribute() internal {
        if (block.timestamp < lastDistributionTime + distributionInterval) {
            revert DistributionNotDue();
        }
        if (distributionAmount == 0) revert ZeroDistribution();
        if (erc20.balanceOf(address(this)) < distributionAmount) {
            revert InsufficientReserve();
        }

        uint64 amount = distributionAmount;

        // Step 1: Shield plaintext ERC-20 → encrypted cUSDC balance using ERC-7984 wrap()
        confidentialToken.wrap(address(this), uint256(amount));

        // Step 2: Transfer the encrypted cUSDC balance into NullYield's prize reserve
        nullYield.fundPrizeFromReserve(amount);

        lastDistributionTime = block.timestamp;
        emit Distributed(block.timestamp, amount);
    }

    // ─────────────────────────────────────────────────────────────────
    // Admin Configuration
    // ─────────────────────────────────────────────────────────────────

    function setDistributionParams(
        uint64 amount_,
        uint256 interval_
    ) external onlyOwner {
        distributionAmount = amount_;
        distributionInterval = interval_;
        emit DistributionParamsUpdated(amount_, interval_);
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    function rescueTokens(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "PrizeReserve: rescue failed");
    }

    // ─────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────

    function reserveBalance() external view returns (uint256) {
        return erc20.balanceOf(address(this));
    }

    function nextDistributionTime() external view returns (uint256) {
        return lastDistributionTime + distributionInterval;
    }
}