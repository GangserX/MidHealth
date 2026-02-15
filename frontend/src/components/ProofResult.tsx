// ----------------------------------------------------------------
// ProofResult.tsx — Verifier checks the on-chain attestation result
//
// Flow:
//   1. Verifier enters the contract address
//   2. Reads the public `lastVerification` and `credentialState` from ledger
//   3. Displays VALID / INVALID / NONE — no private data is ever seen
//
// Ref: https://docs.midnight.network/develop/reference/compact/lang-ref
//      (section: "Declaring and maintaining public state")
// ----------------------------------------------------------------

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  contractAddress: string;
}

// These enums mirror the Compact contract's exported enums
enum CredentialState {
  EMPTY = 0,
  ACTIVE = 1,
  REVOKED = 2,
}

enum VerificationResult {
  NONE = 0,
  VALID = 1,
  INVALID = 2,
}

export function ProofResult({ contractAddress }: Props) {
  const [loading, setLoading] = useState(false);
  const [verificationState, setVerificationState] = useState<{
    credentialState: CredentialState;
    lastVerification: VerificationResult;
    attestationCount: number;
    issuerPubKey: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkResult = async () => {
    if (!contractAddress) {
      setError("Please enter a contract address to verify");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Simulated for scaffold
      await new Promise((r) => setTimeout(r, 1500));

      setVerificationState({
        credentialState: CredentialState.ACTIVE,
        lastVerification: VerificationResult.VALID,
        attestationCount: 2,
        issuerPubKey: "a1b2c3d4e5f6...abcdef1234567890",
      });
    } catch (err: any) {
      setError(`Failed to fetch: ${err?.message ?? "Unknown"}`);
    } finally {
      setLoading(false);
    }
  };

  const getVerificationBadge = (v: VerificationResult) => {
    switch (v) {
      case VerificationResult.VALID:
        return { text: "VALID", emoji: "✅", cls: "badge-success" };
      case VerificationResult.INVALID:
        return { text: "INVALID", emoji: "❌", cls: "badge-error" };
      default:
        return { text: "NONE", emoji: "⏳", cls: "badge-neutral" };
    }
  };

  const getStateBadge = (s: CredentialState) => {
    switch (s) {
      case CredentialState.ACTIVE:
        return { text: "ACTIVE", cls: "active" };
      case CredentialState.REVOKED:
        return { text: "REVOKED", cls: "revoked" };
      default:
        return { text: "EMPTY", cls: "empty" };
    }
  };

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">🔍</span> Verification Result
      </div>
      <p className="card-desc">
        Check whether a patient has successfully proven their vaccination.
        This reads <strong>only public ledger data</strong> — no private
        information is revealed.
      </p>

      <button
        className={`btn ${loading ? "btn-ghost" : "btn-primary"} btn-full`}
        onClick={checkResult}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="spinner" /> Fetching on-chain state...
          </>
        ) : (
          "🔍 Check Verification Status"
        )}
      </button>

      <AnimatePresence>
        {error && (
          <motion.p
            style={{ color: "var(--error)", marginTop: "1rem", fontSize: "0.9rem" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {verificationState && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              marginTop: "1.5rem",
              padding: "1.5rem",
              background: "rgba(5, 8, 22, 0.6)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {/* Big verification result */}
            <motion.div
              style={{ textAlign: "center", marginBottom: "1.5rem" }}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>
                {getVerificationBadge(verificationState.lastVerification).emoji}
              </div>
              <span
                className={`badge ${getVerificationBadge(verificationState.lastVerification).cls}`}
                style={{ fontSize: "0.9rem", padding: "0.4rem 1.2rem" }}
              >
                Proof: {getVerificationBadge(verificationState.lastVerification).text}
              </span>
            </motion.div>

            {/* State details */}
            <div className="state-grid">
              <div className="state-row">
                <span className="state-label">Credential Status</span>
                <span className={`state-value ${getStateBadge(verificationState.credentialState).cls}`}>
                  {getStateBadge(verificationState.credentialState).text}
                </span>
              </div>

              <div className="state-row">
                <span className="state-label">Last Proof Result</span>
                <span className={`state-value ${verificationState.lastVerification === VerificationResult.VALID ? "valid" : verificationState.lastVerification === VerificationResult.INVALID ? "invalid" : "none"}`}>
                  {getVerificationBadge(verificationState.lastVerification).text}
                </span>
              </div>

              <div className="state-row">
                <span className="state-label">Attestation Count</span>
                <span className="state-value">{verificationState.attestationCount}</span>
              </div>

              <div className="state-row">
                <span className="state-label">Issuer Public Key</span>
                <span className="state-value mono">{verificationState.issuerPubKey}</span>
              </div>
            </div>

            <div className="privacy-note mt-lg">
              <span className="lock-icon">🔒</span>
              <span>
                You can see the verification result and credential status, but you{" "}
                <em>cannot</em> see the patient's identity, medical records, or any
                private data. That information was never stored on-chain.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
