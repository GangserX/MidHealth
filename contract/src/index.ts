// ----------------------------------------------------------------
// index.ts — Contract package entry point
//
// Re-exports the compiled contract, witnesses, and provides
// a pre-configured CompiledContract instance.
//
// Pattern: https://github.com/midnightntwrk/example-bboard/blob/main/contract/src/index.ts
// ----------------------------------------------------------------

import { CompiledContract } from "@midnight-ntwrk/compact-js";
export * from "./managed/patient-credential/contract/index.js";
export * from "./witnesses.js";

import * as CompiledPatientCredentialContract from "./managed/patient-credential/contract/index.js";
import * as Witnesses from "./witnesses.js";

/**
 * Pre-configured CompiledContract instance for PatientCredential.
 * Use this in the deploy script and frontend to create contract instances.
 */
export const PatientCredentialCompiledContract = CompiledContract.make<
  CompiledPatientCredentialContract.Contract<Witnesses.MidHealthPrivateState>
>(
  "patient-credential",
  CompiledPatientCredentialContract.Contract<Witnesses.MidHealthPrivateState>
).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets("./compiled/patient-credential")
);
