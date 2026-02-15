// ----------------------------------------------------------------
// witnesses.ts — Private state and witness implementations for
// the PatientCredential Compact contract.
//
// Witnesses run OFF-CHAIN on the user's local machine.
// They provide secret data (keys, patient IDs) to the ZK circuit
// without ever transmitting that data to the network.
//
// Pattern: https://github.com/midnightntwrk/example-bboard/blob/main/contract/src/witnesses.ts
// Ref: https://docs.midnight.network/develop/reference/compact/lang-ref
// ----------------------------------------------------------------

import type { Ledger } from "./managed/patient-credential/contract/index.js";
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";

/**
 * Private state held locally by the user.
 * - secretKey: The user's 32-byte secret (issuer secret key or placeholder)
 * - patientId: The patient's secret identifier (32 bytes)
 * - credential: The credential payload (32 bytes)
 */
export type MidHealthPrivateState = {
  readonly secretKey: Uint8Array;
  readonly patientId: Uint8Array;
  readonly credential: Uint8Array;
};

/**
 * Create an initial private state with the given values.
 */
export const createMidHealthPrivateState = (
  secretKey: Uint8Array,
  patientId: Uint8Array = new Uint8Array(32),
  credential: Uint8Array = new Uint8Array(32)
): MidHealthPrivateState => ({
  secretKey,
  patientId,
  credential,
});

/**
 * Witness implementations mapped to the Compact contract's `witness` declarations.
 *
 * Each witness function receives a WitnessContext<Ledger, PrivateState> and returns
 * a tuple of [newPrivateState, returnValue].
 *
 * The Compact contract declares:
 *   witness issuerSecretKey(): Bytes<32>;
 *   witness patientSecretId(): Bytes<32>;
 *   witness credentialPayload(): Bytes<32>;
 */
export const witnesses = {
  /**
   * Returns the issuer's 32-byte secret key from private state.
   * Used by issueCredential and revokeCredential circuits.
   */
  issuerSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, MidHealthPrivateState>): [
    MidHealthPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],

  /**
   * Returns the patient's secret identifier from private state.
   * Used by issueCredential and proveVaccinated circuits.
   */
  patientSecretId: ({
    privateState,
  }: WitnessContext<Ledger, MidHealthPrivateState>): [
    MidHealthPrivateState,
    Uint8Array,
  ] => [privateState, privateState.patientId],

  /**
   * Returns the credential payload from private state.
   * Used by issueCredential and proveVaccinated circuits.
   */
  credentialPayload: ({
    privateState,
  }: WitnessContext<Ledger, MidHealthPrivateState>): [
    MidHealthPrivateState,
    Uint8Array,
  ] => [privateState, privateState.credential],
};
