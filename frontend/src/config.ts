// ----------------------------------------------------------------
// config.ts — Midnight testnet network endpoints
// These are the defaults; Lace wallet may override via serviceUriConfig().
// Ref: https://docs.midnight.network/develop/tutorial/using/proof-server
// ----------------------------------------------------------------

export const MIDNIGHT_CONFIG = {
  // Midnight local standalone node RPC
  nodeUrl: "http://127.0.0.1:9944",

  // Indexer for querying contract state & events (local)
  indexerUrl: "http://127.0.0.1:8088/api/v3/graphql",

  // Indexer WebSocket (local)
  indexerWsUrl: "ws://127.0.0.1:8088/api/v3/graphql/ws",

  // Local proof server (Docker container)
  proofServerUrl: "http://127.0.0.1:6300",

  // Faucet URL — local network uses funding script, not a web faucet
  faucetUrl: "http://127.0.0.1:9944",

  // Network identifier — "undeployed" for local standalone network
  networkId: "undeployed",
} as const;
