# End-to-End Flow: Healthcare Attestation on Midnight

> **Goal** — A doctor issues a vaccination credential, a patient proves
> their status with zero-knowledge, and a verifier checks the result —
> all on the Midnight testnet. No private data ever appears on-chain.

---

## Prerequisites

| Component | Version | Install |
|-----------|---------|---------|
| Node.js | ≥ 18 LTS | `nvm install --lts` |
| Compact compiler | ≥ 0.20 | `curl -sSL https://github.com/nicedayThx/compact-releases/releases/latest/download/install.sh \| bash` |
| Proof server | latest | `docker pull midnightnetwork/proof-server:latest` |
| Lace wallet | ≥ 2.38 | [Chrome Web Store](https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk) |
| tDUST tokens | — | [Midnight Test Faucet](https://midnight.network/test-faucet) |

---

## Step 0: Compile and Deploy

```bash
# 1. Compile the Compact contract
compact compile contract/src/PatientCredential.compact contract/src/managed

# 2. Start the proof server
docker run -d \
  --name midnight-proof-server \
  -p 6300:6300 \
  midnightnetwork/proof-server:latest \
  --network testnet

# 3. Build TypeScript artifacts
cd contract && npm run build && cd ..

# 4. Start the frontend
cd frontend && npm run dev
```

Open `http://localhost:5173` in Chrome with Lace installed.

---

## Step 1: Doctor Issues a Credential

**Actor:** Doctor (Issuer)  
**Privacy:** Doctor's secret key stays on their machine; only the hash
of the credential appears on-chain.

```
 Doctor's Browser
 ┌───────────────────────────────────────────────────────────────┐
 │                                                               │
 │  1. Connect Lace wallet → clicks "Connect Wallet"             │
 │     ↳ window.midnight.mnLace.enable()                         │
 │                                                               │
 │  2. Select role → "Doctor (Issuer)"                           │
 │                                                               │
 │  3. Fill in credential form:                                  │
 │     • Patient ID: (any identifier, e.g., "patient-0x1A3F")   │
 │     • Credential Data: (e.g., "COVID-19 Pfizer 2024-01-15")  │
 │                                                               │
 │  4. Click "Issue Credential"                                  │
 │     ↳ Frontend calls issueCredential() circuit                │
 │     ↳ Compact contract:                                       │
 │       a. witness issuerSecretKey() → 32-byte secret           │
 │       b. witness credentialPayload() → credential data        │
 │       c. Derives public key via persistentHash(sk)            │
 │       d. Hashes all data: persistentHash(patientId,           │
 │          payload, pubKey)                                      │
 │       e. disclose(computedHash) → published on-chain          │
 │       f. Stores: credentialState = ACTIVE,                    │
 │          credentialHash = hash, issuerPubKey = pubKey          │
 │                                                               │
 │  5. Lace wallet signs and submits the transaction             │
 │     ↳ balanceAndProveTransaction(tx)                          │
 │     ↳ submitTransaction(provenTx)                             │
 │                                                               │
 │  Result: Contract deployed with ACTIVE credential             │
 │          on-chain: hash + public key (no private data)        │
 └───────────────────────────────────────────────────────────────┘
```

### What's on-chain after Step 1

| Ledger Field | Value | Privacy |
|-------------|-------|---------|
| `credentialState` | `ACTIVE` | Public |
| `credentialHash` | `0xa1b2c3...` (32 bytes) | Public (opaque hash) |
| `issuerPubKey` | `0xfedcba...` (32 bytes) | Public |
| `attestationCount` | `1` | Public |
| **Patient ID** | *not stored* | **Private** |
| **Credential data** | *not stored* | **Private** |
| **Issuer secret key** | *not stored* | **Private** |

---

## Step 2: Patient Proves Vaccination

**Actor:** Patient (Prover)  
**Privacy:** Patient's identity and credential details stay in local
memory. The ZK proof server runs locally via Docker. Only the Boolean
result (VALID/INVALID) appears on-chain.

```
 Patient's Browser
 ┌───────────────────────────────────────────────────────────────┐
 │                                                               │
 │  1. Connect Lace wallet                                       │
 │                                                               │
 │  2. Select role → "Patient (Prover)"                          │
 │                                                               │
 │  3. Enter their private credential data:                      │
 │     • Credential Data: "COVID-19 Pfizer 2024-01-15"          │
 │     (Must match exactly what the doctor issued)               │
 │                                                               │
 │  4. Click "Generate Proof"                                    │
 │     ↳ Frontend calls proveVaccinated() circuit                │
 │     ↳ Compact contract:                                       │
 │       a. witness patientSecretId() → patient's secret ID     │
 │       b. witness credentialPayload() → credential data        │
 │       c. Reads ledger: issuerPubKey, credentialHash           │
 │       d. Recomputes hash locally:                             │
 │          persistentHash(patientId, payload, issuerPub)         │
 │       e. assert computedHash == ledger.credentialHash         │
 │       f. If match → disclose(VALID)                           │
 │          If no match → disclose(INVALID)                      │
 │                                                               │
 │  5. Proof server generates ZK proof locally (port 6300)       │
 │                                                               │
 │  6. Lace submits proven transaction                           │
 │                                                               │
 │  Result: lastVerification = VALID (or INVALID)                │
 │          No private data was revealed                         │
 └───────────────────────────────────────────────────────────────┘
```

### ZK Proof: What the verifier sees vs. what exists

```
                  ┌─────────────────────────────────────────────────┐
                  │             ZK Proof Boundary                   │
                  │                                                 │
   Private side   │   Public side (on-chain)                        │
   (never leaves  │                                                 │
    patient's     │   lastVerification: VALID                       │
    machine)      │   attestationCount: 2                           │
                  │   credentialState: ACTIVE                       │
   Patient ID:    │                                                 │
   "patient-0x1…" │   credentialHash: 0xa1b2c3… (unchanged)        │
                  │   issuerPubKey: 0xfedcba… (unchanged)           │
   Credential:    │                                                 │
   "COVID-19 …"   │                                                 │
                  │                                                 │
   Secret Key:    │                                                 │
   0xdeadbeef…    │                                                 │
                  └─────────────────────────────────────────────────┘
```

---

## Step 3: Verifier Checks the Result

**Actor:** Verifier (e.g., airline, border control, employer)  
**Privacy:** Verifier reads ONLY the public ledger. They learn "this
credential is valid" but NOT who the patient is, what vaccine they got,
or when.

```
 Verifier's Browser
 ┌───────────────────────────────────────────────────────────────┐
 │                                                               │
 │  1. Connect Lace wallet (optional — read-only mode possible)  │
 │                                                               │
 │  2. Select role → "Verifier"                                  │
 │                                                               │
 │  3. Enter or scan the contract address                        │
 │                                                               │
 │  4. The UI reads public ledger state via the indexer:         │
 │     ↳ GraphQL query to indexer.testnet-02.midnight.network    │
 │                                                               │
 │  5. Display results:                                          │
 │     ┌─────────────────────────────────────────────┐           │
 │     │  ✅ Credential Status: ACTIVE                │           │
 │     │  ✅ Last Verification: VALID                 │           │
 │     │  📊 Total Attestations: 2                   │           │
 │     │  🔑 Issuer Public Key: 0xfedcba...          │           │
 │     │                                              │           │
 │     │  🔒 This person's identity, vaccination     │           │
 │     │     details, and medical records are NOT     │           │
 │     │     visible. Only the cryptographic proof    │           │
 │     │     result is shown.                          │           │
 │     └─────────────────────────────────────────────┘           │
 │                                                               │
 │  Decision:                                                    │
 │    if (ACTIVE + VALID) → ✅ Accept                            │
 │    if (REVOKED)        → ❌ Reject (credential revoked)      │
 │    if (INVALID)        → ❌ Reject (proof failed)            │
 │    if (EMPTY)          → ⚠️  No credential exists            │
 └───────────────────────────────────────────────────────────────┘
```

---

## Step 4 (Optional): Doctor Revokes a Credential

```
 Doctor's Browser
 ┌───────────────────────────────────────────────────────────────┐
 │                                                               │
 │  1. Connect same wallet used for issuance                     │
 │                                                               │
 │  2. Call revokeCredential() circuit                           │
 │     ↳ witness issuerSecretKey() → same secret key             │
 │     ↳ Derives public key, asserts it matches ledger           │
 │     ↳ Sets credentialState = REVOKED                          │
 │                                                               │
 │  Result: Verifiers now see REVOKED status                     │
 │          Only the original issuer can revoke                  │
 └───────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram

```
  Doctor               Midnight Chain         Patient             Verifier
    │                       │                    │                    │
    │── issueCredential() ─▶│                    │                    │
    │   [sk, payload]       │                    │                    │
    │                       │◀── hash stored ────│                    │
    │                       │                    │                    │
    │                       │◀── proveVacc() ────│                    │
    │                       │   [patientId,      │                    │
    │                       │    payload]         │                    │
    │                       │                    │                    │
    │                       │── VALID/INVALID ──▶│                    │
    │                       │   (public result)  │                    │
    │                       │                    │                    │
    │                       │                    │   readLedger() ──▶│
    │                       │                    │   [ACTIVE, VALID]  │
    │                       │                    │                    │
    │                       │                    │          ✅ Accept │
    │                       │                    │                    │
    │── revokeCredential()─▶│                    │                    │
    │   [sk]                │                    │                    │
    │                       │── REVOKED ────────▶│   readLedger() ──▶│
    │                       │                    │          ❌ Reject │
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Lace won't connect | Ensure Chrome extension is installed and **Midnight testnet** is selected in Lace settings |
| "Failed to clone intent" error | Known Lace v2.38.0 bug — try refreshing the page or updating Lace |
| Proof server won't start | Check Docker is running: `docker ps`. On ARM64 Mac, use `bricktowers/proof-server:7.0.0` |
| Transaction stuck | Check you have ≥ 1 tDUST. Get more from [faucet](https://midnight.network/test-faucet) |
| Compiler not found | Run `source ~/.bashrc` after installing, or add to PATH manually |
| Hash mismatch on prove | Patient must enter **exact** same data the doctor used (case-sensitive) |

---

## Canonical Sources

- [Compact Language Reference](https://docs.midnight.network/develop/reference/compact/lang-ref)
- [Midnight Cookbook](https://docs.midnight.network/develop/tutorial/building/cookbook)
- [Example: Bulletin Board](https://github.com/nicedayThx/midnight-examples/tree/main/examples/bboard)
- [Starter: Voting DApp](https://github.com/nicedayThx/midnight-voting-dapp)
- [Midnight Testnet Faucet](https://midnight.network/test-faucet)
- [Mesh SDK](https://meshjs.dev/midnight)
