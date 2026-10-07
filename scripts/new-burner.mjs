#!/usr/bin/env node
// Generates a throwaway burner wallet for Sepolia deployment and appends it
// to .env (never commit that file; never reuse a key that touches mainnet).
import { Wallet } from "ethers";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const wallet = Wallet.createRandom();
const line = `DEPLOYER_PRIVATE_KEY=${wallet.privateKey}`;

let env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
if (/^DEPLOYER_PRIVATE_KEY=/m.test(env)) {
  env = env.replace(/^DEPLOYER_PRIVATE_KEY=.*$/m, line);
  writeFileSync(".env", env);
} else {
  appendFileSync(".env", `\n${line}\n`);
}

console.log(`Burner wallet written to .env`);
console.log(`Address (fund this with Sepolia ETH): ${wallet.address}`);
console.log(`Faucets: Google Cloud Sepolia faucet, Alchemy, QuickNode, Chainlink - or the professor's 0.01 ETH form.`);
