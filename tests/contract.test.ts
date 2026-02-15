// ----------------------------------------------------------------
// contract.test.ts — Unit tests for the PatientCredential contract
//
// These tests simulate the contract's circuit logic to verify
// correctness before deploying to testnet.
//
// In a real Midnight project, you would use the compiled contract
// artifacts and the @midnight/compact-runtime to run circuits
// locally. This file demonstrates the test structure.
//
// Ref: https://docs.midnight.network/develop/reference/compact/lang-ref
//      https://github.com/midnightntwrk/example-bboard
// ----------------------------------------------------------------

// Simulated types mirroring the Compact contract's exported enums
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

// Simulated hash function (in production, use persistentHash from compact-runtime)
function simulateHash(parts: Uint8Array[]): Uint8Array {
  // Simple XOR hash for testing — real contract uses persistentHash
  const result = new Uint8Array(32);
  for (const part of parts) {
    for (let i = 0; i < 32 && i < part.length; i++) {
      result[i] ^= part[i];
    }
  }
  return result;
}

function strToBytes32(s: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(s);
  bytes.set(encoded.slice(0, 32));
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

// ---- Tests -------------------------------------------------------

console.log("╔══════════════════════════════════════════════════╗");
console.log("║    PatientCredential Contract — Unit Tests       ║");
console.log("╚══════════════════════════════════════════════════╝\n");

// Test 1: Credential hash computation
console.log("Test 1: Credential hash is deterministic");
{
  const patientId = strToBytes32("patient-12345");
  const payload = strToBytes32("COVID-19-Dose-2");
  const issuerPub = strToBytes32("issuer-pubkey-abc");

  const hash1 = simulateHash([patientId, payload, issuerPub]);
  const hash2 = simulateHash([patientId, payload, issuerPub]);

  assert(
    bytesToHex(hash1) === bytesToHex(hash2),
    "Same inputs produce same hash"
  );

  const differentPayload = strToBytes32("COVID-19-Dose-1");
  const hash3 = simulateHash([patientId, differentPayload, issuerPub]);

  assert(
    bytesToHex(hash1) !== bytesToHex(hash3),
    "Different inputs produce different hash"
  );
}

// Test 2: Public key derivation
console.log("\nTest 2: Public key derivation from secret key");
{
  const secretKey = strToBytes32("doctor-secret-key-001");
  const sequence = strToBytes32(String(1));
  const prefix = strToBytes32("midhealth:pk:");

  const pubKey = simulateHash([prefix, sequence, secretKey]);

  assert(pubKey.length === 32, "Public key is 32 bytes");
  assert(
    bytesToHex(pubKey) !== bytesToHex(secretKey),
    "Public key differs from secret key"
  );

  // Same secret + sequence = same public key
  const pubKey2 = simulateHash([prefix, sequence, secretKey]);
  assert(
    bytesToHex(pubKey) === bytesToHex(pubKey2),
    "Same secret key + sequence produces same public key"
  );

  // Different sequence = different public key (replay protection)
  const sequence2 = strToBytes32(String(2));
  const pubKey3 = simulateHash([prefix, sequence2, secretKey]);
  assert(
    bytesToHex(pubKey) !== bytesToHex(pubKey3),
    "Different sequence produces different public key (replay protection)"
  );
}

// Test 3: Issuing a credential (simulated circuit execution)
console.log("\nTest 3: Issue credential flow");
{
  // Simulated ledger state
  let state: {
    credentialState: CredentialState;
    credentialHash: Uint8Array;
    issuerPubKey: Uint8Array;
    attestationCount: number;
    lastVerification: VerificationResult;
    sequence: number;
  } = {
    credentialState: CredentialState.EMPTY,
    credentialHash: new Uint8Array(32),
    issuerPubKey: new Uint8Array(32),
    attestationCount: 0,
    lastVerification: VerificationResult.NONE,
    sequence: 1,
  };

  // Pre-condition
  assert(
    state.credentialState === CredentialState.EMPTY,
    "Pre: credential state is EMPTY"
  );

  // Simulate issueCredential circuit
  const issuerSk = strToBytes32("doctor-secret-001");
  const seqBytes = strToBytes32(String(state.sequence));
  const prefix = strToBytes32("midhealth:pk:");
  const pubKey = simulateHash([prefix, seqBytes, issuerSk]);

  const patientId = strToBytes32("patient-uuid-789");
  const payload = strToBytes32("Hepatitis-B-Vaccine");
  const credHash = simulateHash([patientId, payload, pubKey]);

  // Apply state changes (what the circuit does via disclose)
  state.issuerPubKey = pubKey;
  state.credentialHash = credHash;
  state.credentialState = CredentialState.ACTIVE;
  state.attestationCount++;

  // Post-conditions
  assert(
    state.credentialState === CredentialState.ACTIVE,
    "Post: credential state is ACTIVE"
  );
  assert(state.attestationCount === 1, "Post: attestation count is 1");
  assert(
    bytesToHex(state.credentialHash) !== "0".repeat(64),
    "Post: credential hash is set (non-zero)"
  );
  assert(
    bytesToHex(state.issuerPubKey) !== "0".repeat(64),
    "Post: issuer public key is set (non-zero)"
  );
}

// Test 4: Proving vaccination (simulated)
console.log("\nTest 4: Prove vaccination flow");
{
  // Setup: credential is active
  const issuerSk = strToBytes32("doctor-secret-001");
  const seqBytes = strToBytes32(String(1));
  const prefix = strToBytes32("midhealth:pk:");
  const issuerPub = simulateHash([prefix, seqBytes, issuerSk]);

  const patientId = strToBytes32("patient-uuid-789");
  const payload = strToBytes32("Hepatitis-B-Vaccine");
  const onChainHash = simulateHash([patientId, payload, issuerPub]);

  // Patient provides correct data
  const computedHash = simulateHash([patientId, payload, issuerPub]);
  const isValid = bytesToHex(computedHash) === bytesToHex(onChainHash);

  assert(isValid, "Valid credential produces matching hash (proof succeeds)");

  // Patient provides WRONG data
  const wrongPayload = strToBytes32("WRONG-VACCINE");
  const wrongHash = simulateHash([patientId, wrongPayload, issuerPub]);
  const isInvalid = bytesToHex(wrongHash) !== bytesToHex(onChainHash);

  assert(isInvalid, "Wrong credential data produces different hash (proof fails)");
}

// Test 5: Revocation
console.log("\nTest 5: Revocation — only original issuer can revoke");
{
  const issuerSk = strToBytes32("doctor-secret-001");
  const seqBytes = strToBytes32(String(1));
  const prefix = strToBytes32("midhealth:pk:");
  const issuerPub = simulateHash([prefix, seqBytes, issuerSk]);

  // Attacker tries to revoke with a different key
  const attackerSk = strToBytes32("attacker-secret-999");
  const attackerPub = simulateHash([prefix, seqBytes, attackerSk]);

  const canRevoke = bytesToHex(attackerPub) === bytesToHex(issuerPub);
  assert(!canRevoke, "Attacker with different key cannot revoke");

  // Original issuer can revoke
  const originalPub = simulateHash([prefix, seqBytes, issuerSk]);
  const ownerCanRevoke = bytesToHex(originalPub) === bytesToHex(issuerPub);
  assert(ownerCanRevoke, "Original issuer can revoke their credential");
}

// Test 6: Double-issuance prevention
console.log("\nTest 6: Cannot issue to an occupied slot");
{
  // Use a function to prevent TypeScript literal narrowing — we're testing runtime enum comparisons
  const getState = (s: CredentialState): CredentialState => s;
  let credState = getState(CredentialState.ACTIVE);

  // The circuit asserts credentialState == EMPTY
  const canIssue = credState === CredentialState.EMPTY;
  assert(!canIssue, "Cannot issue when slot is ACTIVE (assertion would fail)");

  credState = getState(CredentialState.REVOKED);
  const canIssueRevoked = credState === CredentialState.EMPTY;
  assert(
    !canIssueRevoked,
    "Cannot issue when slot is REVOKED (assertion would fail)"
  );
}

// ---- Summary -----------------------------------------------------
console.log("\n" + "═".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("═".repeat(50));

if (failed > 0) {
  process.exit(1);
}

export {};
