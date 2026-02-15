/**
 * fund-wallet.ts — Fund any unshielded address from the genesis wallet (local network only).
 *
 * Usage:
 *   npx tsx src/fund-wallet.ts <unshielded-address>
 *
 * OR set RECEIVER_ADDRESS env var:
 *   RECEIVER_ADDRESS=mn_addr_undeployed1... npx tsx src/fund-wallet.ts
 */

import * as Rx from "rxjs";
import { WebSocket } from "ws";
import * as ledger from "@midnight-ntwrk/ledger-v7";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  UnshieldedWallet,
  PublicKey,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { setNetworkId, getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

// @ts-expect-error: needed for apollo WS transport
globalThis.WebSocket = WebSocket;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const INDEXER = process.env.INDEXER_URL ?? "http://127.0.0.1:8088/api/v3/graphql";
const INDEXER_WS = process.env.INDEXER_WS_URL ?? "ws://127.0.0.1:8088/api/v3/graphql/ws";
const NODE = process.env.NODE_URL ?? "http://127.0.0.1:9944";
const PROOF_SERVER = process.env.PROOF_SERVER_URL ?? "http://127.0.0.1:6300";
const NETWORK_ID = process.env.NETWORK_ID ?? "undeployed";

const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
const FUND_AMOUNT = 50_000_000_000n; // 50 tNight (generous amount)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function formatBalance(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const receiverAddress =
    process.argv[2] ??
    process.env.RECEIVER_ADDRESS;

  if (!receiverAddress) {
    console.error("Usage: npx tsx src/fund-wallet.ts <unshielded-address>");
    console.error("  e.g. npx tsx src/fund-wallet.ts mn_addr_undeployed1y039wcjh5cvww48rahqz6dh83lzguj33fls9h6enrxjrsk0v0gfqxkru65");
    process.exit(1);
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         Fund Wallet from Genesis (Local Network)        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log(`  Network:  ${NETWORK_ID}`);
  console.log(`  Receiver: ${receiverAddress}`);
  console.log(`  Amount:   ${formatBalance(FUND_AMOUNT)} tNight\n`);

  setNetworkId(NETWORK_ID);

  // Build genesis wallet
  console.log("  [1/5] Deriving genesis wallet keys...");
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

  console.log("  [2/5] Starting genesis wallet sub-wallets...");

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

  // Wait for sync
  console.log("  [3/5] Syncing genesis wallet...");
  const syncedState = await Rx.firstValueFrom(
    genesisWallet.state().pipe(
      Rx.throttleTime(3_000),
      Rx.filter((s) => s.isSynced)
    )
  );

  const genesisBalance =
    (syncedState.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
    (syncedState.shielded?.balances[ledger.nativeToken().raw] ?? 0n);
  console.log(`  ✓ Genesis balance: ${formatBalance(genesisBalance)} tNight`);

  if (genesisBalance < FUND_AMOUNT) {
    console.error(`  ✗ Insufficient genesis balance! Need ${formatBalance(FUND_AMOUNT)} tNight`);
    process.exit(1);
  }

  // Create transfer
  console.log(`  [4/5] Creating transfer of ${formatBalance(FUND_AMOUNT)} tNight...`);
  const recipe = await genesisWallet.transferTransaction(
    [
      {
        type: "unshielded",
        outputs: [
          {
            amount: FUND_AMOUNT,
            receiverAddress: receiverAddress,
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

  console.log("  [5/5] Submitting transaction...");
  const txHash = await genesisWallet.submitTransaction(finalizedTx);
  console.log(`\n  ✓ Transaction submitted!`);
  console.log(`    Hash: ${txHash}`);
  console.log(`    Amount: ${formatBalance(FUND_AMOUNT)} tNight → ${receiverAddress.slice(0, 30)}...`);

  try {
    await genesisWallet.stop();
  } catch {
    // ignore cleanup
  }

  console.log("\n  Done! Your wallet should receive funds shortly.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
