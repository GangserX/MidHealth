// ----------------------------------------------------------------
// server.ts — Optional Express backend for MidHealth
//
// Responsibilities:
//   1. Serve static UI assets (production build)
//   2. Index public contract events from Midnight indexer
//   3. Proxy proof-server config if needed
//   4. Provide a REST API for verifier queries
//
// This backend NEVER handles private data. It only reads public
// ledger state from the Midnight indexer.
//
// Ref: https://docs.midnight.network/develop/tutorial/building
// ----------------------------------------------------------------

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

// Midnight local standalone indexer endpoint
const INDEXER_URL =
  process.env.INDEXER_URL ||
  "http://127.0.0.1:8088/api/v3/graphql";

app.use(cors());
app.use(express.json());

// ---- Health check ------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    network: "midnight-local",
    indexer: INDEXER_URL,
    timestamp: new Date().toISOString(),
  });
});

// ---- Fetch public contract state ---------------------------------
// Queries the Midnight indexer for a contract's public ledger state.
// This only returns PUBLIC data — no private data ever flows here.
app.get("/api/contract/:address/state", async (req, res) => {
  try {
    const { address } = req.params;

    // GraphQL query to the Midnight indexer (v3 schema)
    const query = {
      query: `
        query GetContractAction($address: HexEncoded!) {
          contractAction(address: $address) {
            address
            state
          }
        }
      `,
      variables: { address },
    };

    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error(`Indexer responded with ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Error fetching contract state:", err.message);
    res.status(500).json({
      error: "Failed to fetch contract state",
      message: err.message,
    });
  }
});

// ---- Fetch recent transactions for contract ----------------------
// Returns recent contract actions from the indexer.
app.get("/api/contract/:address/events", async (req, res) => {
  try {
    const { address } = req.params;

    const query = {
      query: `
        query GetContractTransactions($address: HexEncoded!) {
          contractAction(address: $address) {
            address
            state
            transaction {
              hash
              blockHeight
            }
          }
        }
      `,
      variables: { address },
    };

    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error(`Indexer responded with ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Error fetching events:", err.message);
    res.status(500).json({
      error: "Failed to fetch events",
      message: err.message,
    });
  }
});

// ---- Proof server config proxy -----------------------------------
// Returns the proof server URL so the frontend doesn't need to
// hardcode it. In production, this could be configurable.
app.get("/api/proof-config", (_req, res) => {
  res.json({
    proofServerUrl: process.env.PROOF_SERVER_URL || "http://127.0.0.1:6300",
    network: "undeployed",
  });
});

// ---- Start server ------------------------------------------------
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║          MidHealth Backend Server                ║
║──────────────────────────────────────────────────║
║  Port:     ${PORT}                                  ║
║  Network:  Midnight Local (undeployed)           ║
║  Indexer:  ${INDEXER_URL.slice(0, 40)}...          ║
╚══════════════════════════════════════════════════╝
  `);
  console.log(`Endpoints:
  GET  /api/health
  GET  /api/contract/:address/state
  GET  /api/contract/:address/events?limit=20
  GET  /api/proof-config
  `);
});
