/**
 * deploy.ts — Standalone deploy script for the PatientCredential contract.
 *
 * Usage:
 *   cd contract
 *   npm run compact       # Compile Compact → ZK circuits + TS bindings
 *   npm run build         # Build TypeScript
 *   npm run deploy        # Run this script
 *
 * Prompts for a hex seed (or generates a new one), builds a wallet,
 * waits for sync + funds, deploys the PatientCredential contract,
 * and writes deployment.json with the contract address.
 *
 * Pattern: https://github.com/Megh2005/midnight-voting-dapp/blob/main/voting-contract/src/deploy.ts
 * Ref: https://docs.midnight.network/develop/tutorial/building
 */

import * as readline from "node:readline/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import pino from "pino";
import pinoPretty from "pino-pretty";

import {
  Contract,
  ledger as patientCredentialLedger,
} from "./managed/patient-credential/contract/index.js";
import { witnesses, createMidHealthPrivateState } from "./witnesses.js";
import type { MidHealthPrivateState } from "./witnesses.js";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { toHex } from "@midnight-ntwrk/midnight-js-utils";
import type {
  MidnightProvider,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type { ImpureCircuitId } from "@midnight-ntwrk/compact-js";
import * as ledger from "@midnight-ntwrk/ledger-v7";

import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  type UnshieldedKeystore,
  UnshieldedWallet,
  PublicKey,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import {
  generateRandomSeed,
  HDWallet,
  Roles,
} from "@midnight-ntwrk/wallet-sdk-hd";

// @ts-expect-error: needed for apollo WS transport
globalThis.WebSocket = WebSocket;

// ---------------------------------------------------------------------------
// Config – default endpoints for Midnight preprod network
// Override via env: INDEXER_URL, INDEXER_WS_URL, NODE_URL, PROOF_SERVER_URL, NETWORK_ID
// ---------------------------------------------------------------------------
const INDEXER =
  process.env.INDEXER_URL ??
  "http://127.0.0.1:8088/api/v3/graphql";
const INDEXER_WS =
  process.env.INDEXER_WS_URL ??
  "ws://127.0.0.1:8088/api/v3/graphql/ws";
const NODE =
  process.env.NODE_URL ?? "http://127.0.0.1:9944";
const PROOF_SERVER =
  process.env.PROOF_SERVER_URL ?? "http://127.0.0.1:6300";
const NETWORK_ID = process.env.NETWORK_ID ?? "undeployed";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// ZK assets (keys, zkir) live in src/managed, not dist — tsc doesn't copy them
const zkConfigPath = path.resolve(
  currentDir,
  "..",
  "src",
  "managed",
  "patient-credential"
);
const deploymentPath = path.resolve(currentDir, "..", "deployment.json");

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
const logger = pino(
  { level: process.env.DEBUG_LEVEL ?? "info" },
  pinoPretty({
    colorize: true,
    sync: true,
    translateTime: true,
    ignore: "pid,time",
    singleLine: false,
  })
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MidHealthCircuits = ImpureCircuitId<Contract<MidHealthPrivateState>>;
const MidHealthPrivateStateId = "midHealthPrivateState" as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

async function withStatus<T>(
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${frames[i++ % frames.length]} ${message}`);
  }, 80);
  try {
    const result = await fn();
    clearInterval(interval);
    process.stdout.write(`\r  ✓ ${message}\n`);
    return result;
  } catch (e) {
    clearInterval(interval);
    process.stdout.write(`\r  ✗ ${message}\n`);
    throw e;
  }
}

function deriveKeysFromSeed(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk")
    throw new Error("Failed to initialize HDWallet from seed");

  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (result.type !== "keysDerived")
    throw new Error("Failed to derive keys");
  hdWallet.hdWallet.clear();
  return result.keys;
}

const formatBalance = (b: bigint) => b.toLocaleString();

// ---------------------------------------------------------------------------
// Wallet build
// ---------------------------------------------------------------------------
async function buildWallet(seed: string) {
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(
    keys[Roles.Zswap]
  );
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(
    keys[Roles.NightExternal],
    getNetworkId()
  );

  const shieldedWallet = ShieldedWallet({
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: INDEXER,
      indexerWsUrl: INDEXER_WS,
    },
    provingServerUrl: new URL(PROOF_SERVER),
    relayURL: new URL(NODE.replace(/^http/, "ws")),
  }).startWithSecretKeys(shieldedSecretKeys);

  const unshieldedWallet = UnshieldedWallet({
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: INDEXER,
      indexerWsUrl: INDEXER_WS,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

  const dustWallet = DustWallet({
    networkId: getNetworkId(),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
    indexerClientConnection: {
      indexerHttpUrl: INDEXER,
      indexerWsUrl: INDEXER_WS,
    },
    provingServerUrl: new URL(PROOF_SERVER),
    relayURL: new URL(NODE.replace(/^http/, "ws")),
  } as any).startWithSecretKey(
    dustSecretKey,
    ledger.LedgerParameters.initialParameters().dust
  );

  const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

// ---------------------------------------------------------------------------
// Provider creation
// ---------------------------------------------------------------------------
function createWalletAndMidnightProvider(
  wallet: WalletFacade,
  shieldedSecretKeys: ledger.ZswapSecretKeys,
  dustSecretKey: ledger.DustSecretKey,
  unshieldedKeystore: UnshieldedKeystore,
  syncedState: any
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey: () =>
      syncedState.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () =>
      syncedState.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      const signFn = (payload: Uint8Array) =>
        unshieldedKeystore.signData(payload);
      // Sign transaction intents
      if (recipe.baseTransaction.intents) {
        for (const segment of recipe.baseTransaction.intents.keys()) {
          const intent = recipe.baseTransaction.intents.get(segment);
          if (!intent) continue;
          const cloned =
            ledger.Intent.deserialize(
              "signature",
              "proof",
              "pre-binding",
              intent.serialize()
            );
          const sigData = cloned.signatureData(segment);
          const signature = signFn(sigData);
          if (cloned.fallibleUnshieldedOffer) {
            const sigs =
              cloned.fallibleUnshieldedOffer.inputs.map(
                (_: any, i: number) =>
                  cloned.fallibleUnshieldedOffer!.signatures.at(i) ??
                  signature
              );
            cloned.fallibleUnshieldedOffer =
              cloned.fallibleUnshieldedOffer.addSignatures(sigs);
          }
          if (cloned.guaranteedUnshieldedOffer) {
            const sigs =
              cloned.guaranteedUnshieldedOffer.inputs.map(
                (_: any, i: number) =>
                  cloned.guaranteedUnshieldedOffer!.signatures.at(i) ??
                  signature
              );
            cloned.guaranteedUnshieldedOffer =
              cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
          }
          recipe.baseTransaction.intents.set(segment, cloned as any);
        }
      }
      return wallet.finalizeRecipe(recipe);
    },
    async submitTx(tx: ledger.FinalizedTransaction) {
      return wallet.submitTransaction(tx);
    },
  };
}

// ---------------------------------------------------------------------------
// Dust registration
// ---------------------------------------------------------------------------
async function registerForDustGeneration(
  wallet: WalletFacade,
  unshieldedKeystore: UnshieldedKeystore
) {
  const state = await Rx.firstValueFrom(
    wallet.state().pipe(Rx.filter((s) => s.isSynced))
  );

  if (state.dust.availableCoins.length > 0) {
    const dustBal = state.dust.walletBalance(new Date());
    console.log(
      `  ✓ Dust tokens already available (${formatBalance(dustBal)} DUST)`
    );
    return;
  }

  const nightUtxos = state.unshielded.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true
  );

  if (nightUtxos.length > 0) {
    await withStatus(
      `Registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation`,
      async () => {
        const recipe = await wallet.registerNightUtxosForDustGeneration(
          nightUtxos,
          unshieldedKeystore.getPublicKey(),
          (payload) => unshieldedKeystore.signData(payload)
        );
        const finalized = await wallet.finalizeRecipe(recipe);
        await wallet.submitTransaction(finalized);
      }
    );
  }

  await withStatus("Waiting for dust tokens to generate", () =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n)
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Genesis funding (local network only)
// ---------------------------------------------------------------------------
async function fundFromGenesis(receiverUnshieldedAddress: string) {
  const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
  const FUND_AMOUNT = 31_337_000_000n;

  const genesisKeys = deriveKeysFromSeed(GENESIS_SEED);
  const genesisShieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(
    genesisKeys[Roles.Zswap]
  );
  const genesisDustSecretKey = ledger.DustSecretKey.fromSeed(
    genesisKeys[Roles.Dust]
  );
  const genesisUnshieldedKeystore = createKeystore(
    genesisKeys[Roles.NightExternal],
    getNetworkId()
  );

  const genesisShieldedWallet = ShieldedWallet({
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: INDEXER,
      indexerWsUrl: INDEXER_WS,
    },
    provingServerUrl: new URL(PROOF_SERVER),
    relayURL: new URL(NODE.replace(/^http/, "ws")),
  }).startWithSecretKeys(genesisShieldedSecretKeys);

  const genesisUnshieldedWallet = UnshieldedWallet({
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: INDEXER,
      indexerWsUrl: INDEXER_WS,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(genesisUnshieldedKeystore));

  const genesisDustWallet = DustWallet({
    networkId: getNetworkId(),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
    indexerClientConnection: {
      indexerHttpUrl: INDEXER,
      indexerWsUrl: INDEXER_WS,
    },
    provingServerUrl: new URL(PROOF_SERVER),
    relayURL: new URL(NODE.replace(/^http/, "ws")),
  } as any).startWithSecretKey(
    genesisDustSecretKey,
    ledger.LedgerParameters.initialParameters().dust
  );

  const genesisWallet = new WalletFacade(
    genesisShieldedWallet,
    genesisUnshieldedWallet,
    genesisDustWallet
  );
  await genesisWallet.start(genesisShieldedSecretKeys, genesisDustSecretKey);

  // Wait for genesis wallet sync
  await Rx.firstValueFrom(
    genesisWallet.state().pipe(Rx.filter((s) => s.isSynced))
  );

  const recipe = await genesisWallet.transferTransaction(
    [
      {
        type: "unshielded",
        outputs: [
          {
            amount: FUND_AMOUNT,
            receiverAddress: receiverUnshieldedAddress,
            type: ledger.unshieldedToken().raw,
          },
        ],
      },
    ],
    {
      shieldedSecretKeys: genesisShieldedSecretKeys,
      dustSecretKey: genesisDustSecretKey,
    },
    {
      ttl: new Date(Date.now() + 30 * 60 * 1000),
      payFees: true,
    }
  );

  const signedTx = await genesisWallet.signUnprovenTransaction(
    recipe.transaction,
    (payload) => genesisUnshieldedKeystore.signData(payload)
  );

  const finalizedTx = await genesisWallet.finalizeTransaction(signedTx);
  const txHash = await genesisWallet.submitTransaction(finalizedTx);

  try {
    await genesisWallet.stop();
  } catch {
    // ignore cleanup errors
  }

  return txHash;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  setNetworkId(NETWORK_ID);

  console.log(
    "\n╔══════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║      PatientCredential Contract Deploy Script           ║"
  );
  console.log(
    `║      Network: ${NETWORK_ID.padEnd(42)}║`
  );
  console.log(
    "╚══════════════════════════════════════════════════════════╝\n"
  );

  // --- Seed prompt ---
  const rl = readline.createInterface({ input, output });
  const seedInput = await rl.question(
    "Enter hex seed (leave blank to generate new): "
  );
  rl.close();

  let seed: string;
  if (seedInput.trim()) {
    seed = seedInput.trim();
    console.log(`  Using provided seed: ${seed.slice(0, 8)}...`);
  } else {
    seed = toHex(Buffer.from(generateRandomSeed()));
    console.log(`  Generated new seed: ${seed}`);
    console.log("  ⚠ Save this seed to restore your wallet later!\n");
  }

  // --- Build wallet ---
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } =
    await withStatus("Building wallet", () => buildWallet(seed));

  console.log(
    `\n  Unshielded address: ${unshieldedKeystore.getBech32Address()}`
  );
  console.log(
    "  Fund via faucet: https://midnight.network/test-faucet\n"
  );

  // --- Wait for sync ---
  const syncedState = await withStatus(
    "Syncing wallet with network",
    () =>
      Rx.firstValueFrom(
        wallet.state().pipe(
          Rx.throttleTime(5_000),
          Rx.tap((s) => logger.debug(`Sync status: ${s.isSynced}`)),
          Rx.filter((s) => s.isSynced)
        )
      )
  );

  // --- Wait for funds ---
  const balance =
    (syncedState.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
    (syncedState.shielded?.balances[ledger.nativeToken().raw] ?? 0n);

  if (balance === 0n) {
    if (NETWORK_ID === "undeployed") {
      // Auto-fund from genesis on local network
      const unshieldedAddr = unshieldedKeystore.getBech32Address();
      await withStatus(
        "Auto-funding wallet from genesis (local network)",
        async () => {
          const txHash = await fundFromGenesis(unshieldedAddr.toString());
          logger.info({ txHash }, "Genesis funding transaction submitted");
        }
      );
      // Wait for funds to arrive
      await withStatus(
        "Waiting for funded balance to sync",
        () =>
          Rx.firstValueFrom(
            wallet.state().pipe(
              Rx.throttleTime(5_000),
              Rx.filter((s) => s.isSynced),
              Rx.map(
                (s) =>
                  (s.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
                  (s.shielded?.balances[ledger.nativeToken().raw] ?? 0n)
              ),
              Rx.filter((b) => b > 0n)
            )
          )
      );
    } else {
      await withStatus(
        "Waiting for incoming funds (send tNight to address above)",
        () =>
          Rx.firstValueFrom(
            wallet.state().pipe(
              Rx.throttleTime(10_000),
              Rx.tap((s) => {
                const u =
                  s.unshielded?.balances[ledger.nativeToken().raw] ?? 0n;
                logger.debug(`Balance: ${u}`);
              }),
              Rx.filter((s) => s.isSynced),
              Rx.map(
                (s) =>
                  (s.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
                  (s.shielded?.balances[ledger.nativeToken().raw] ?? 0n)
              ),
              Rx.filter((b) => b > 0n)
            )
          )
      );
    }
  } else {
    console.log(`  ✓ Balance: ${formatBalance(balance)} tNight`);
  }

  // --- Dust registration ---
  await registerForDustGeneration(wallet, unshieldedKeystore);

  // --- Build providers ---
  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    wallet,
    shieldedSecretKeys,
    dustSecretKey,
    unshieldedKeystore,
    syncedState
  );

  const zkConfigProvider = new NodeZkConfigProvider<MidHealthCircuits>(
    zkConfigPath
  );

  const providers = {
    privateStateProvider:
      levelPrivateStateProvider<typeof MidHealthPrivateStateId>({
        privateStateStoreName: "midhealth-private-state",
        signingKeyStoreName: "signing-keys",
        midnightDbName: "midnight-level-db",
        walletProvider: walletAndMidnightProvider,
      }),
    publicDataProvider: indexerPublicDataProvider(INDEXER, INDEXER_WS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };

  // --- Compile contract ---
  const compiledContract = CompiledContract.make(
    "patient-credential",
    Contract
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath)
  );

  // --- Deploy ---
  const contract = await withStatus(
    "Deploying PatientCredential contract (this may take a few minutes)",
    async () => {
      return deployContract(providers, {
        compiledContract,
        privateStateId: MidHealthPrivateStateId,
        initialPrivateState: createMidHealthPrivateState(
          new Uint8Array(32) // placeholder — actual secret key will be set per-user
        ),
      });
    }
  );

  const contractAddress = contract.deployTxData.public.contractAddress;

  // --- Write deployment.json ---
  const deployment = {
    contractAddress,
    network: NETWORK_ID,
    deployedAt: new Date().toISOString(),
    seed,
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log(
    `\n╔══════════════════════════════════════════════════════════╗`
  );
  console.log(
    `║  PatientCredential Contract deployed successfully!      ║`
  );
  console.log(
    `╚══════════════════════════════════════════════════════════╝`
  );
  console.log(`  Address: ${contractAddress}`);
  console.log(`  Saved:   ${deploymentPath}\n`);

  // Cleanup
  try {
    await wallet.stop();
  } catch {
    // ignore cleanup errors
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error(err, "Deploy failed");
  process.exit(1);
});
