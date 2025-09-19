// Test Script for Shinrai LeverageHook
// This shows how to interact with the deployed hook

const { ethers } = require("ethers");

// Contract addresses from .env
const CONTRACTS = {
    POOL_MANAGER: "0x49217E4F5eaEFbdA69Bc325b56Cc65974B27699D",
    LEVERAGE_HOOK: "0xedd7a4642F404a06b3051Eb794e5d001c6aD83c0",
    MARGIN_ROUTER: "0x3dd63AdB03d46fEA41c14D6a557bd3E329DFecC1",
    GLOBAL_LEDGER: "0x8498fa4591201deF1380328103c7d7050d1F5dd7"
};

// Test configuration
const TEST_CONFIG = {
    RPC_URL: "https://holesky.drpc.org",
    PRIVATE_KEY: "0xa24c0fa235354c563c21260535e44492e3f99c824fb80414f77a5fdc00113fa3",
    MOCK_TOKEN0: "0x1111111111111111111111111111111111111111",
    MOCK_TOKEN1: "0x2222222222222222222222222222222222222222"
};

async function testLeverageHook() {
    console.log("🚀 Testing Shinrai LeverageHook");

    // 1. Create pool key for testing
    const poolKey = {
        currency0: TEST_CONFIG.MOCK_TOKEN0,
        currency1: TEST_CONFIG.MOCK_TOKEN1,
        fee: 3000, // 0.3%
        tickSpacing: 60,
        hooks: CONTRACTS.LEVERAGE_HOOK
    };

    // 2. Create leverage request data
    const leverageRequest = {
        trader: "0xfE8F62e7ACce644e9861b3F03b1c25e3CbE665b6",
        collateralToken: TEST_CONFIG.MOCK_TOKEN0,
        collateralAmount: ethers.parseEther("100"), // 100 tokens
        borrowAmount: ethers.parseEther("300"),     // 300 tokens
        leverageRatio: 300,                         // 3x leverage
        isLongPosition: true,
        positionId: ethers.keccak256(ethers.toUtf8Bytes("test_position"))
    };

    // 3. Encode hook data
    const hookData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint256,uint256,uint256,bool,bytes32)"],
        [[
            leverageRequest.trader,
            leverageRequest.collateralToken,
            leverageRequest.collateralAmount,
            leverageRequest.borrowAmount,
            leverageRequest.leverageRatio,
            leverageRequest.isLongPosition,
            leverageRequest.positionId
        ]]
    );

    console.log("📊 Test Data Created:");
    console.log("Pool Key:", poolKey);
    console.log("Leverage Request:", leverageRequest);
    console.log("Hook Data Length:", hookData.length);

    return { poolKey, leverageRequest, hookData };
}

// Export for use in Foundry tests
module.exports = { testLeverageHook, CONTRACTS, TEST_CONFIG };