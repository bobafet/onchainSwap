const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying ArcDEX (multi-pair) from:", deployer.address);

  const DEX = await hre.ethers.getContractFactory("ArcDEX");
  const dex = await DEX.deploy();
  await dex.waitForDeployment();
  const addr = await dex.getAddress();

  console.log("\nArcDEX deployed:", addr);
  console.log("https://testnet.arcscan.app/address/" + addr);
  console.log("\nVITE_CONTRACT_ADDRESS=" + addr);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
