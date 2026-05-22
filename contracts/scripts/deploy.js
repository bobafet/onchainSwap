const hre = require("hardhat");
async function main() {
  const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying ArcDEX from:", deployer.address);
  console.log("EURC token:", EURC);

  const DEX = await hre.ethers.getContractFactory("ArcDEX");
  const dex = await DEX.deploy(EURC);
  await dex.waitForDeployment();
  const addr = await dex.getAddress();

  console.log("\nArcDEX deployed:", addr);
  console.log("https://testnet.arcscan.app/address/" + addr);
  console.log("\nVITE_CONTRACT_ADDRESS=" + addr);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
