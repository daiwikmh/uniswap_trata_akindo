# Step 1: Deploy Core Contracts
  forge script script/01_DeployCore.s.sol:DeployCore
  --rpc-url https://holesky.drpc.org
  --broadcast

  # Step 2: Register Operators with EigenLayer
  forge script
  script/02_RegisterOperators.s.sol:RegisterOperators
  --rpc-url https://holesky.drpc.org
  --broadcast

  # Step 3: Configure Protocol Parameters
  forge script
  script/03_ConfigureProtocol.s.sol:ConfigureProtocol
  --rpc-url https://holesky.drpc.org
  --broadcast

  # Step 4: Test Integration (Optional)
  forge script
  script/04_TestIntegration.s.sol:TestIntegration --rpc-url
  https://holesky.drpc.org --broadcast