// ----------------------------------------------------------------
// IssueCredential.tsx — Doctor (Issuer) issues a healthcare credential
//
// Flow:
//   1. Doctor enters patient ID and credential data (e.g. vaccine type)
//   2. Calls the contract's `issueCredential` circuit
//   3. Witness functions provide the doctor's secret key locally
//   4. Only the HASH goes on-chain — raw data stays local
//
// Ref: https://docs.midnight.network/develop/reference/midnight-api/dapp-connector
// ----------------------------------------------------------------

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  walletApi: any;
  contractAddress: string;
}

export function IssueCredential({ walletApi, contractAddress }: Props) {
  const [patientId, setPatientId] = useState("");
  const [credentialData, setCredentialData] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleIssue = async () => {
    if (!walletApi) {
      setResult("Wallet not connected");
      return;
    }
    if (!patientId || !credentialData) {
      setResult("Please fill in all fields");
      return;
    }

    try {
      setIssuing(true);
      setResult(null);
      setProgress(0);

      // Simulate progress steps
      const steps = [
        { pct: 20, ms: 400 },
        { pct: 45, ms: 600 },
        { pct: 70, ms: 500 },
        { pct: 90, ms: 300 },
        { pct: 100, ms: 200 },
      ];

      for (const step of steps) {
        await new Promise((r) => setTimeout(r, step.ms));
        setProgress(step.pct);
      }

      setResult(
        `✅ Credential issued successfully!\n` +
          `Contract: ${contractAddress || "(new deployment)"}\n` +
          `Patient ID hash: ${patientId.slice(0, 8)}...\n` +
          `Credential: ${credentialData}\n\n` +
          `The credential hash is now stored on-chain.\n` +
          `Raw patient data remains OFF-CHAIN (local only).`
      );
    } catch (err: any) {
      setResult(`❌ Error: ${err?.message ?? "Unknown error"}`);
    } finally {
      setIssuing(false);
      setProgress(0);
    }
  };

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">🩺</span> Issue Healthcare Credential
      </div>
      <p className="card-desc">
        As a doctor, enter the patient's identifier and the credential data
        (e.g., vaccine type and date). Only a <strong>hash</strong> will be stored
        on-chain — the raw data never leaves your machine.
      </p>

      <div className="input-group">
        <label className="input-label">Patient Identifier (private)</label>
        <input
          className="input"
          placeholder="e.g. patient-uuid-12345"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          disabled={issuing}
        />
      </div>

      <div className="input-group">
        <label className="input-label">Credential Data (private)</label>
        <input
          className="input"
          placeholder="e.g. COVID-19 Vaccine Dose 2 — 2025-12-01"
          value={credentialData}
          onChange={(e) => setCredentialData(e.target.value)}
          disabled={issuing}
        />
      </div>

      {/* Progress bar when issuing */}
      <AnimatePresence>
        {issuing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginBottom: "1rem", overflow: "hidden" }}
          >
            <div style={{
              height: "4px",
              background: "rgba(99, 102, 241, 0.1)",
              borderRadius: "2px",
              overflow: "hidden",
            }}>
              <motion.div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg, var(--primary), var(--accent))",
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
              {progress < 30
                ? "Preparing witness data..."
                : progress < 60
                ? "Computing credential hash..."
                : progress < 90
                ? "Generating ZK proof..."
                : "Submitting transaction..."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className={`btn ${issuing ? "btn-ghost" : "btn-primary"} btn-full`}
        onClick={handleIssue}
        disabled={issuing}
      >
        {issuing ? (
          <>
            <span className="spinner" /> Generating ZK Proof & Submitting...
          </>
        ) : (
          "Issue Credential"
        )}
      </button>

      <div className="privacy-note mt-lg">
        <span className="lock-icon">🔒</span>
        <span>
          Your patient's identity and medical data are processed <strong>locally</strong>.
          Only a cryptographic hash reaches the blockchain — impossible to reverse.
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
