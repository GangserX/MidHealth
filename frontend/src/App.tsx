// ----------------------------------------------------------------
// App.tsx — Main application component
// Handles wallet connection, role selection, and flow orchestration.
//
// Flow:
//   1. User connects Lace wallet
//   2. Chooses role: Doctor (Issuer) or Patient (Prover) or Verifier
//   3. Corresponding component renders
//
// Ref: https://docs.midnight.network/develop/reference/midnight-api/dapp-connector
// ----------------------------------------------------------------

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MIDNIGHT_CONFIG } from "./config";
import { IssueCredential } from "./components/IssueCredential";
import { RequestProof } from "./components/RequestProof";
import { ProofResult } from "./components/ProofResult";
import "./styles.css";

// Roles available in the dApp
type Role = "issuer" | "prover" | "verifier" | null;

// Wallet connection state
interface WalletState {
  connected: boolean;
  address: string | null;
  api: any | null;
}

// Framer motion variants
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
  exit: { opacity: 0, y: -16, transition: { duration: 0.3 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

export default function App() {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: null,
    api: null,
  });
  const [role, setRole] = useState<Role>(null);
  const [contractAddress, setContractAddress] = useState<string>(
    "10dbb900e355b98cf2b395e60228795e7189b7b845d9915ab2854a21da95bbbb"
  );
  const [status, setStatus] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

  // ---- Wallet Connect ------------------------------------------------
  const connectWallet = useCallback(async () => {
    try {
      setConnecting(true);
      setStatus("Connecting to Lace wallet...");

      if (!window.midnight?.mnLace) {
        setStatus(
          "Lace wallet not detected. Install it from the Chrome Web Store."
        );
        setConnecting(false);
        return;
      }

      const lace = window.midnight!.mnLace;
      console.log("Lace wallet found:", lace.name, "v" + lace.apiVersion);

      // Wrap connect() in a timeout — Lace may never resolve if user
      // ignores the approval popup.
      setStatus("Approve the connection in your Lace wallet popup...");
      const connectWithTimeout = <T,>(
        promise: Promise<T>,
        ms: number
      ): Promise<T> =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Wallet connection timed out — check the Lace popup in your browser toolbar")), ms)
          ),
        ]);

      let api: any;
      try {
        api = await connectWithTimeout(lace.connect(MIDNIGHT_CONFIG.networkId), 30000);
      } catch (timeoutErr: any) {
        setStatus(timeoutErr.message);
        setConnecting(false);
        return;
      }
      console.log("Wallet connected via connect()");

      let uriConfig;
      try {
        uriConfig = await api.getConfiguration();
        console.log("Lace service URIs:", uriConfig);
      } catch {
        console.log("Using default network config");
        uriConfig = MIDNIGHT_CONFIG;
      }

      let address = "unknown";
      try {
        const shielded = await api.getShieldedAddresses();
        address = shielded?.shieldedAddress ?? "unknown";
      } catch {
        try {
          const unshielded = await api.getUnshieldedAddress();
          address = unshielded?.unshieldedAddress ?? "unknown";
        } catch {
          console.log("Could not retrieve address, using 'unknown'");
        }
      }

      setWallet({ connected: true, address, api });
      setStatus(`Connected: ${address.slice(0, 16)}...`);
      console.log("Wallet connected:", address);
    } catch (err: any) {
      console.error("Wallet connection failed:", err);
      setStatus(`Connection failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet({ connected: false, address: null, api: null });
    setRole(null);
    setStatus("Disconnected");
  }, []);

  const roles = [
    {
      id: "issuer" as Role,
      icon: "🩺",
      name: "Doctor",
      desc: "Issue a healthcare credential",
    },
    {
      id: "prover" as Role,
      icon: "🛡️",
      name: "Patient",
      desc: "Prove your vaccination status",
    },
    {
      id: "verifier" as Role,
      icon: "🔍",
      name: "Verifier",
      desc: "Check proof on-chain",
    },
  ];

  // ---- Render --------------------------------------------------------
  return (
    <>
      {/* Animated background orbs + grid */}
      <div className="app-bg" />
      <div className="grid-overlay" />

      <div className="app-container">
        {/* Header */}
        <motion.header
          className="app-header"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="logo-container">
            <div className="logo-icon">🏥</div>
            <span className="logo-text">MidHealth</span>
          </div>
          <p className="app-tagline">
            Privacy-Preserving Healthcare Attestation on{" "}
            <a href="https://midnight.network/" target="_blank" rel="noreferrer">
              Midnight
            </a>
          </p>
          <div className="header-badge">
            <span className="dot" />
            Local Network &middot; Zero-Knowledge Proofs
          </div>
        </motion.header>

        {/* Wallet Connection */}
        <motion.div
          className="card"
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          <div className="card-title">
            <span className="icon">🔗</span> Wallet Connection
          </div>
          {!wallet.connected ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="card-desc">
                Connect your Lace Midnight wallet to interact with the
                PatientCredential contract.
              </p>
              <button
                className="btn btn-primary btn-lg btn-full mt-md"
                onClick={connectWallet}
                disabled={connecting}
              >
                {connecting ? (
                  <>
                    <span className="spinner" /> Connecting...
                  </>
                ) : (
                  "Connect Lace Wallet"
                )}
              </button>
              {connecting && (
                <p className="card-desc mt-md" style={{ textAlign: "center" }}>
                  {status}
                </p>
              )}
              {!connecting && status && (
                <p className="card-desc mt-md" style={{ textAlign: "center", color: status.includes("failed") || status.includes("timed out") || status.includes("not detected") ? "var(--error)" : "var(--text-dim)" }}>
                  {status}
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              className="wallet-connected"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="wallet-address">
                <span className="pulse" />
                {wallet.address?.slice(0, 24)}...
              </div>
              <button className="btn btn-danger" onClick={disconnectWallet}>
                Disconnect
              </button>
            </motion.div>
          )}
        </motion.div>

        {/* Contract Address */}
        <AnimatePresence>
          {wallet.connected && (
            <motion.div
              className="card"
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="card-title">
                <span className="icon">📋</span> Contract Address
              </div>
              <p className="card-desc">
                The deployed PatientCredential contract on your local Midnight
                network.
              </p>
              <div className="input-group">
                <label className="input-label">Contract Address (hex)</label>
                <input
                  className="input input-mono"
                  placeholder="e.g. d9eceafb52a63da8..."
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Role Selection */}
        <AnimatePresence>
          {wallet.connected && (
            <motion.div
              className="card"
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="card-title">
                <span className="icon">👤</span> Select Your Role
              </div>
              <p className="card-desc">
                Choose how you want to interact with the contract.
              </p>
              <div className="role-grid">
                {roles.map((r, i) => (
                  <motion.div
                    key={r.id}
                    className={`role-card ${role === r.id ? "active" : ""}`}
                    onClick={() => setRole(r.id)}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { delay: 0.15 + i * 0.08 },
                    }}
                  >
                    <span className="role-icon">{r.icon}</span>
                    <div className="role-name">{r.name}</div>
                    <div className="role-desc">{r.desc}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Role-specific Component */}
        <AnimatePresence mode="wait">
          {wallet.connected && role === "issuer" && (
            <motion.div
              key="issuer"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <IssueCredential
                walletApi={wallet.api}
                contractAddress={contractAddress}
              />
            </motion.div>
          )}
          {wallet.connected && role === "prover" && (
            <motion.div
              key="prover"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <RequestProof
                walletApi={wallet.api}
                contractAddress={contractAddress}
              />
            </motion.div>
          )}
          {wallet.connected && role === "verifier" && (
            <motion.div
              key="verifier"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <ProofResult contractAddress={contractAddress} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Bar */}
        <AnimatePresence>
          {status && (
            <motion.div
              className="status-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {status}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="app-footer">
          <div className="footer-brand">
            Built on{" "}
            <a href="https://midnight.network/" target="_blank" rel="noreferrer">
              Midnight
            </a>{" "}
            — Privacy-first blockchain
          </div>
          <div className="footer-links">
            <a href="https://docs.midnight.network/" target="_blank" rel="noreferrer">
              Documentation
            </a>
            <a href="https://midnight.network/test-faucet" target="_blank" rel="noreferrer">
              Faucet
            </a>
            <a href="https://github.com/midnightntwrk/example-bboard" target="_blank" rel="noreferrer">
              Example dApp
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
