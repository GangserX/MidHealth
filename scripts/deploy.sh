#!/usr/bin/env bash
# ================================================================
# deploy.sh — Compile Compact contract and deploy to Midnight testnet
#
# Prerequisites:
#   1. Compact compiler installed: compact compile --version
#   2. Docker running with proof server: docker ps | grep proof-server
#   3. Lace wallet funded with tDUST from https://midnight.network/test-faucet
#   4. Node.js ≥ 18: node --version
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Ref: https://docs.midnight.network/develop/tutorial/building
#      https://github.com/midnightntwrk/example-bboard
# ================================================================

set -euo pipefail

echo "╔══════════════════════════════════════════════════╗"
echo "║       MidHealth — Deploy to Midnight Testnet     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ---- Step 1: Check prerequisites --------------------------------
echo "🔍 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install via: nvm install 18 --lts"
    exit 1
fi
NODE_VER=$(node --version)
echo "  ✅ Node.js: $NODE_VER"

# Check Compact compiler
if ! command -v compact &> /dev/null; then
    echo "❌ Compact compiler not found."
    echo "   Install: curl --proto '=https' --tlsv1.2 -LsSf \\"
    echo "     https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh"
    echo ""
    echo "   Docs: https://docs.midnight.network/develop/tutorial/building"
    exit 1
fi
COMPACT_VER=$(compact compile --version 2>&1 || echo "unknown")
echo "  ✅ Compact compiler: $COMPACT_VER"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install: https://docs.docker.com/desktop/"
    exit 1
fi
echo "  ✅ Docker: $(docker --version | head -1)"

# Check proof server
if ! docker ps 2>/dev/null | grep -q proof-server; then
    echo ""
    echo "⚠️  Proof server not running. Starting it now..."
    echo "   docker run -d -p 6300:6300 midnightnetwork/proof-server \\"
    echo "     -- midnight-proof-server --network testnet"
    docker run -d -p 6300:6300 midnightnetwork/proof-server \
        -- midnight-proof-server --network testnet
    echo "  ✅ Proof server started on port 6300"
    sleep 3
else
    echo "  ✅ Proof server: running"
fi

echo ""

# ---- Step 2: Compile Compact contract ----------------------------
echo "📝 Compiling Compact contract..."
cd contract

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "  Installing contract dependencies..."
    npm install
fi

# Run the Compact compiler
# Ref: https://docs.midnight.network/develop/reference/compact
echo "  Running: compact compile src/PatientCredential.compact ./src/managed/patient-credential"
compact compile src/PatientCredential.compact ./src/managed/patient-credential

echo "  ✅ Compilation successful!"
echo ""

# Build TypeScript
echo "  Building TypeScript artifacts..."
npm run build
echo "  ✅ Build complete. Artifacts in contract/dist/"
echo ""

cd ..

# ---- Step 3: Deploy contract to testnet --------------------------
echo "🚀 Deploying PatientCredential to Midnight Testnet..."
echo ""
echo "  Running the deploy script from contract/dist/deploy.js..."
echo "  This will:"
echo "    • Create (or restore) a wallet from a hex seed"
echo "    • Sync with the testnet and wait for funding"
echo "    • Deploy the compiled contract on-chain"
echo "    • Write contract address to contract/deployment.json"
echo ""

# Set environment for testnet
export NETWORK_ID="${NETWORK_ID:-testnet}"
export INDEXER_URL="${INDEXER_URL:-https://indexer.testnet-02.midnight.network/api/v1/graphql}"
export INDEXER_WS_URL="${INDEXER_WS_URL:-wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws}"
export NODE_URL="${NODE_URL:-wss://rpc.testnet-02.midnight.network}"
export PROOF_SERVER_URL="${PROOF_SERVER_URL:-http://localhost:6300}"

cd contract
node dist/deploy.js
cd ..

# ---- Step 4: Output summary -------------------------------------
echo "╔══════════════════════════════════════════════════╗"
echo "║                 Deployment Summary               ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Contract:    PatientCredential.compact          ║"
echo "║  Network:     Midnight Testnet                   ║"
echo "║  Proof Port:  6300                               ║"
echo "║  Faucet:      https://midnight.network/test-faucet║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Start frontend:  cd frontend && npm run dev"
echo "  2. Start backend:   cd backend && npm start"
echo "  3. Open browser:    http://localhost:5173"
echo "  4. Connect Lace wallet and interact!"
echo ""
echo "📖 Docs: https://docs.midnight.network/"
echo "🐙 Example: https://github.com/midnightntwrk/example-bboard"
