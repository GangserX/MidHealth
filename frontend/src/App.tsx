import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MIDNIGHT_CONFIG } from "./config";
import { IssueCredential } from "./components/IssueCredential";
import { RequestProof } from "./components/RequestProof";
import { ProofResult } from "./components/ProofResult";
import "./styles.css";

type Role = "issuer" | "prover" | "verifier" | null;

interface WalletState {
  connected: boolean;
  address: string | null;
  api: any | null;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.2 } },
};

export default function App() {
  const [wallet, setWallet] = useState<WalletState>({ connected: false, address: null, api: null });
  const [role, setRole] = useState<Role>(null);
  const [contractAddress, setContractAddress] = useState<string>(
    "10dbb900e355b98cf2b395e60228795e7189b7b845d9915ab2854a21da95bbbb"
  );
  const [status, setStatus] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

  const connectWallet = useCallback(async () => {
    try {
      setConnecting(true);
      setStatus("Connecting to Lace wallet...");

      if (!window.midnight?.mnLace) {
        setStatus("Lace wallet not detected. Install it from the Chrome Web Store.");
        setConnecting(false);
        return;
      }

      const lace = window.midnight!.mnLace;
      setStatus("Approve the connection in your Lace wallet popup...");
      const connectWithTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
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
    { id: "issuer" as Role, icon: "🩺", name: "Doctor", desc: "Issue a healthcare credential" },
    { id: "prover" as Role, icon: "🛡️", name: "Patient", desc: "Prove your vaccination status" },
    { id: "verifier" as Role, icon: "🔍", name: "Verifier", desc: "Validate cryptographic proofs" },
  ];

  return (
    <>
      <div className="app-bg" />
      <div className="app-gradient" />

      <div className="app-container">
        <header className="top-nav">
          <div className="logo-container">
            <div className="logo-icon">✚</div>
            <span className="logo-text">MidHealth</span>
          </div>
          <a href="https://midnight.network/" target="_blank" rel="noreferrer" className="nav-link">
            Powered by Midnight
          </a>
        </header>

        <motion.section
          className="hero"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="hero-pill">Healthcare credentials, redesigned</span>
          <h1>Modern, private verification for clinics and patients.</h1>
          <p>
            A Shopify-inspired experience with clean workflows for issuing health credentials,
            proving eligibility, and verifying state without exposing private data.
          </p>
          <div className="hero-stats">
            <div><strong>Zero-knowledge</strong><span>Proof-backed attestations</span></div>
            <div><strong>Privacy first</strong><span>Raw medical data stays local</span></div>
            <div><strong>Built for trust</strong><span>Auditable on-chain results</span></div>
          </div>
        </motion.section>

        <motion.div className="card" custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <div className="section-heading">
            <div className="card-title"><span className="icon">🔗</span>Connect Wallet</div>
            <p className="card-desc">Connect Lace to unlock issuance, proof generation, and verification.</p>
          </div>

          {!wallet.connected ? (
            <>
              <button className="btn btn-primary btn-lg" onClick={connectWallet} disabled={connecting}>
                {connecting ? <><span className="spinner" /> Connecting...</> : "Connect Lace Wallet"}
              </button>
              {status && (
                <p className="card-desc mt-md" style={{ color: status.includes("failed") || status.includes("timed out") || status.includes("not detected") ? "var(--error)" : "var(--text-dim)" }}>
                  {status}
                </p>
              )}
            </>
          ) : (
            <div className="wallet-connected">
              <div className="wallet-address"><span className="pulse" />{wallet.address?.slice(0, 24)}...</div>
              <button className="btn btn-ghost" onClick={disconnectWallet}>Disconnect</button>
            </div>
          )}
        </motion.div>

        <AnimatePresence>
          {wallet.connected && (
            <motion.div className="card" custom={1} variants={fadeUp} initial="hidden" animate="visible" exit="exit">
              <div className="section-heading">
                <div className="card-title"><span className="icon">📋</span>Contract Setup</div>
                <p className="card-desc">Update the deployed PatientCredential contract address for this session.</p>
              </div>
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

        <AnimatePresence>
          {wallet.connected && (
            <motion.div className="card" custom={2} variants={fadeUp} initial="hidden" animate="visible" exit="exit">
              <div className="section-heading">
                <div className="card-title"><span className="icon">👤</span>Choose Workspace</div>
                <p className="card-desc">Select your role to continue in the workflow that matches your job.</p>
              </div>
              <div className="role-grid">
                {roles.map((r, i) => (
                  <motion.div
                    key={r.id}
                    className={`role-card ${role === r.id ? "active" : ""}`}
                    onClick={() => setRole(r.id)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.08 + i * 0.05 } }}
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

        <AnimatePresence mode="wait">
          {wallet.connected && role === "issuer" && (
            <motion.div key="issuer" variants={scaleIn} initial="hidden" animate="visible" exit="exit">
              <IssueCredential walletApi={wallet.api} contractAddress={contractAddress} />
            </motion.div>
          )}
          {wallet.connected && role === "prover" && (
            <motion.div key="prover" variants={scaleIn} initial="hidden" animate="visible" exit="exit">
              <RequestProof walletApi={wallet.api} contractAddress={contractAddress} />
            </motion.div>
          )}
          {wallet.connected && role === "verifier" && (
            <motion.div key="verifier" variants={scaleIn} initial="hidden" animate="visible" exit="exit">
              <ProofResult contractAddress={contractAddress} />
            </motion.div>
          )}
        </AnimatePresence>

        {status && <div className="status-bar">{status}</div>}

        <footer className="app-footer">
          <div className="footer-brand">MidHealth • Secure credential rails for modern healthcare teams</div>
          <div className="footer-links">
            <a href="https://docs.midnight.network/" target="_blank" rel="noreferrer">Documentation</a>
            <a href="https://midnight.network/test-faucet" target="_blank" rel="noreferrer">Faucet</a>
            <a href="https://github.com/midnightntwrk/example-bboard" target="_blank" rel="noreferrer">Example dApp</a>
          </div>
        </footer>
      </div>
    </>
  );
}
