// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialToken (cUSDC)
/// @notice ERC-7984 confidential wrapper around a plaintext ERC-20 (mUSDC).
///         Users shield plaintext tokens into encrypted cUSDC balances and unshield them back out.
contract ConfidentialToken is ERC7984ERC20Wrapper, ZamaEthereumConfig {
    constructor(
        IERC20 underlying_
    )
        ERC7984("Confidential USDC", "cUSDC", "")
        ERC7984ERC20Wrapper(underlying_)
    {}
}