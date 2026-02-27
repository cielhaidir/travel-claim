import { readFileSync, writeFileSync } from "fs";

import { readFileSync, writeFileSync } from "fs";

const path = "./src/components/features/travel/TravelRequestForm.tsx";

// The file was corrupted: UTF-8 bytes were read by PowerShell as Windows-1252,
// then each Windows-1252 character was re-encoded as UTF-8 and written back.
// Net effect: the file has UTF-8 encoding of the Windows-1252 interpretation of the original UTF-8 bytes.
// Fix: read the file as Latin-1 (which gives us the Windows-1252 char values as code points),
// then convert those char values back to bytes, then interpret those bytes as UTF-8.

const rawBytes = readFileSync(path); // raw Buffer
// Convert raw UTF-8 bytes into Windows-1252 code points
// by reading as latin1 (ISO-8859-1), then converting each code point back to a byte
const latin1 = rawBytes.toString("latin1");
// Now each char in latin1 corresponds to a byte value
// Re-interpret those byte values as original UTF-8
const originalBytes = Buffer.from(latin1, "latin1");
const corrected = originalBytes.toString("utf8");

writeFileSync(path, corrected, "utf8");
console.log("Done. Lines:", corrected.split("\n").length);
