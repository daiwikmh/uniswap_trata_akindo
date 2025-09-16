// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {IEigenAssetVerifier} from "./interface/IEigenAssetVerifier.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";


contract EigenPredictHook is BaseHook {
    // Address of the EigenAssetVerifierContract
    IEigenAssetVerifier public immutable verifier;

    // Constructor sets the PoolManager and Verifier addresses
    constructor(IPoolManager _poolManager, address _verifier) BaseHook(_poolManager) {
        verifier = IEigenAssetVerifier(_verifier);
    }

    // Required by BaseHook: Specifies which hooks are implemented
      function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: true,
                beforeAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterAddLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    // Called before a swap in the Uniswap V4 pool
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // Extract market ID (e.g., from pool metadata or key)
        bytes32 marketId = _getMarketId(key);

        // Call the EigenAssetVerifierContract to validate swap conditions
        bool canSwap = verifier.verifySwap(marketId, params, hookData);

        // Revert if verification fails
        require(canSwap, "EigenPredictHook: Swap not allowed by verifier");

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    // Internal function to derive market ID (customize based on your setup)
    function _getMarketId(PoolKey calldata key) internal pure returns (bytes32) {
        // Example: Hash pool key components to generate a unique market ID
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing));
    }
}