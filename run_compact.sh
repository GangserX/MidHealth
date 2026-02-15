#!/bin/bash
export PATH=/home/bisha/.local/bin:$PATH
cd /mnt/c/Users/bisha/Music/Midnight_main\'/midnight2/contract
echo "=== Compiling PatientCredential.compact ==="
compact compile src/PatientCredential.compact src/managed/patient-credential 2>&1
echo "=== Exit code: $? ==="