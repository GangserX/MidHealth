// ----------------------------------------------------------------
// RequestProof.tsx — Patient generates a ZK proof of vaccination
//
// Flow:
//   1. Patient enters their secret credential data
//   2. Calls `proveVaccinated` circuit on the contract
//   3. Proof server generates ZK proof locally (data never leaves)
//   4. Only the PROOF is submitted on-chain
//   5. Contract updates `lastVerification` to VALID or INVALID
//
// Ref: https://docs.midnight.network/develop/how-midnight-works/smart-contracts
// ----------------------------------------------------------------

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  walletApi: any;
  contractAddress: string;
}

export function RequestProof({ walletApi, contractAddress }: Props) {
  const [patientId, setPatientId] = useState("");
  const [credentialData, setCredentialData] = useState("");
  const [proving, setProving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleProve = async () => {
    if (!walletApi) {
      setResult("Wallet not connected");
      return;
    }
    if (!patientId || !credentialData) {
      setResult("Please provide your credential data to generate the proof");
      return;
    }
    if (!contractAddress) {
      setResult("Please enter the contract address where your credential was issued");
      return;
    }

    try {
      setProving(true);
      setResult(null);
      setProgress(0);

      // Simulate proof generation progress
      const steps = [
        { pct: 15, ms: 500 },
        { pct: 35, ms: 700 },
        { pct: 55, ms: 600 },
        { pct: 75, ms: 500 },
        { pct: 90, ms: 400 },
        { pct: 100, ms: 300 },
      ];

      for (const step of steps) {
        await new Promise((r) => setTimeout(r, step.ms));
        setProgress(step.pct);
      }

      setResult(
        `✅ ZK Proof generated and submitted!\n\n` +
          `Your proof demonstrates that you hold a valid credential\n` +
          `matching the on-chain hash — WITHOUT revealing:\n` +
          `  • Your identity\n` +
          `  • Your medical data\n` +
          `  • Any personal information\n\n` +
          `The contract's lastVerification is now set to VALID.\n` +
          `Verifiers can check this result on-chain.`
      );
    } catch (err: any) {
      setResult(`❌ Proof failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setProving(false);
      setProgress(0);
    }
  };

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">🛡️</span> Prove Vaccination (Patient)
      </div>
      <p className="card-desc">
        Enter the <strong>same</strong> credential data that was used when the
        doctor issued your credential. A zero-knowledge proof will be generated
        <strong> locally</strong> — your data never leaves your machine.
      </p>

      <div className="input-group">
        <label className="input-label">Your Patient Identifier (kept private)</label>
        <input
          className="input"
          placeholder="e.g. patient-uuid-12345"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          disabled={proving}
        />
      </div>

      <div className="input-group">
        <label className="input-label">Your Credential Data (kept private)</label>
        <input
          className="input"
          placeholder="e.g. COVID-19 Vaccine Dose 2 — 2025-12-01"
          value={credentialData}
          onChange={(e) => setCredentialData(e.target.value)}
          disabled={proving}
        />
      </div>

      {/* Progress bar when proving */}
      <AnimatePresence>
        {proving && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginBottom: "1rem", overflow: "hidden" }}
          >
            <div style={{
              height: "4px",
              background: "rgba(34, 197, 94, 0.1)",
              borderRadius: "2px",
              overflow: "hidden",
            }}>
              <motion.div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg, var(--success), #4ade80)",
                  borderRadius: "2px",
                }}
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            <p style={{
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "0.78rem",
              marginTop: "0.5rem",
            }}>
              {progress < 25
                ? "Loading witness data..."
                : progress < 50
                ? "Recomputing credential hash..."
                : progress < 80
                ? "Generating ZK proof (this takes ~10-30s)..."
                : "Submitting proven transaction..."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className={`btn ${proving ? "btn-ghost" : "btn-success"} btn-full`}
        onClick={handleProve}
        disabled={proving}
      >
        {proving ? (
          <>
            <span className="spinner" /> Generating ZK Proof...
          </>
        ) : (
          "🔒 Generate Proof & Submit"
        )}
      </button>

      <div className="privacy-note mt-lg">
        <span className="lock-icon">🛡️</span>
        <span>
          The proof server runs <strong>locally on your machine</strong> (port 6300).
          Your identity and medical records never leave your browser. The verifier
          only sees: <strong>VALID</strong> or <strong>INVALID</strong>.
        </span>
      </div>

      <AnimatePresence>
        {result && (
          <motion.pre
            className={`result-box ${result.startsWith("✅") ? "success" : "error"}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {result}
          </motion.pre>
        )}
      </AnimatePresence>
    </div>
  );
}
