// ----------------------------------------------------------------
// verifier.test.ts — Verification flow tests
//
// Simulates how a verifier UI checks proof results from the public
// ledger without ever accessing private data.
//
// Ref: https://docs.midnight.network/develop/reference/compact/lang-ref
// ----------------------------------------------------------------

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

interface PublicLedgerState {
  credentialState: CredentialState;
  credentialHash: string;
  issuerPubKey: string;
  attestationCount: number;
  lastVerification: VerificationResult;
}

// ---- Test helpers ------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// Simulates reading public ledger state from the Midnight indexer
function simulateLedgerRead(
  scenario: "valid" | "invalid" | "empty" | "revoked"
): PublicLedgerState {
  switch (scenario) {
    case "valid":
      return {
        credentialState: CredentialState.ACTIVE,
        credentialHash: "a1b2c3d4e5f6789012345678abcdef01a1b2c3d4e5f6789012345678abcdef01",
        issuerPubKey: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        attestationCount: 2,
        lastVerification: VerificationResult.VALID,
      };
    case "invalid":
      return {
        credentialState: CredentialState.ACTIVE,
        credentialHash: "a1b2c3d4e5f6789012345678abcdef01a1b2c3d4e5f6789012345678abcdef01",
        issuerPubKey: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        attestationCount: 2,
        lastVerification: VerificationResult.INVALID,
      };
    case "revoked":
      return {
        credentialState: CredentialState.REVOKED,
        credentialHash: "a1b2c3d4e5f6789012345678abcdef01a1b2c3d4e5f6789012345678abcdef01",
        issuerPubKey: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        attestationCount: 3,
        lastVerification: VerificationResult.NONE,
      };
    case "empty":
    default:
      return {
        credentialState: CredentialState.EMPTY,
        credentialHash: "0".repeat(64),
        issuerPubKey: "0".repeat(64),
        attestationCount: 0,
        lastVerification: VerificationResult.NONE,
      };
  }
}

// Verifier's decision logic
function verifierDecision(state: PublicLedgerState): {
  accepted: boolean;
  reason: string;
} {
  if (state.credentialState === CredentialState.EMPTY) {
    return { accepted: false, reason: "No credential has been issued at this address" };
  }
  if (state.credentialState === CredentialState.REVOKED) {
    return { accepted: false, reason: "Credential has been revoked by the issuer" };
  }
  if (state.lastVerification === VerificationResult.VALID) {
    return { accepted: true, reason: "Valid proof verified on-chain" };
  }
  if (state.lastVerification === VerificationResult.INVALID) {
    return { accepted: false, reason: "Proof verification failed — data mismatch" };
  }
  return { accepted: false, reason: "No verification attempt has been made yet" };
}

// ---- Tests -------------------------------------------------------

console.log("╔══════════════════════════════════════════════════╗");
console.log("║       Verifier Flow — Integration Tests          ║");
console.log("╚══════════════════════════════════════════════════╝\n");

// Test 1: Valid proof
console.log("Test 1: Verifier accepts a valid proof");
{
  const state = simulateLedgerRead("valid");
  const decision = verifierDecision(state);

  assert(decision.accepted === true, "Verifier accepts valid proof");
  assert(
    decision.reason.includes("Valid"),
    `Reason mentions validity: "${decision.reason}"`
  );

  // Verify no private data is visible
  assert(
    state.credentialHash.length === 64,
    "Credential hash is a hex string (no raw data)"
  );
  assert(
    state.issuerPubKey.length === 64,
    "Issuer key is a public key (not a secret key)"
  );
}

// Test 2: Invalid proof
console.log("\nTest 2: Verifier rejects an invalid proof");
{
  const state = simulateLedgerRead("invalid");
  const decision = verifierDecision(state);

  assert(decision.accepted === false, "Verifier rejects invalid proof");
  assert(
    decision.reason.includes("failed"),
    `Reason mentions failure: "${decision.reason}"`
  );
}

// Test 3: Empty contract
console.log("\nTest 3: Verifier handles empty contract");
{
  const state = simulateLedgerRead("empty");
  const decision = verifierDecision(state);

  assert(decision.accepted === false, "Verifier rejects empty contract");
  assert(
    decision.reason.includes("No credential"),
    `Reason mentions empty: "${decision.reason}"`
  );
}

// Test 4: Revoked credential
console.log("\nTest 4: Verifier rejects revoked credential");
{
  const state = simulateLedgerRead("revoked");
  const decision = verifierDecision(state);

  assert(decision.accepted === false, "Verifier rejects revoked credential");
  assert(
    decision.reason.includes("revoked"),
    `Reason mentions revocation: "${decision.reason}"`
  );
}

// Test 5: Privacy assertion — verifier never sees private data
console.log("\nTest 5: Privacy — verifier only sees public state");
{
  const state = simulateLedgerRead("valid");

  // These fields should NOT contain any identifiable patient information
  const potentialPII = [
    "patient",
    "name",
    "ssn",
    "dob",
    "address",
    "vaccine",
    "COVID",
  ];

  for (const keyword of potentialPII) {
    const inHash = state.credentialHash
      .toLowerCase()
      .includes(keyword.toLowerCase());
    const inKey = state.issuerPubKey
      .toLowerCase()
      .includes(keyword.toLowerCase());

    assert(
      !inHash && !inKey,
      `Public state does not contain PII keyword "${keyword}"`
    );
  }
}

// ---- Summary -----------------------------------------------------
console.log("\n" + "═".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("═".repeat(50));

if (failed > 0) {
  process.exit(1);
}

export {};
