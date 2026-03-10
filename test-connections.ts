/**
 * test-connections.ts
 * Run: bun test-connections.ts
 *
 * Tests:
 *   1. Environment variables
 *   2. Database connection + user count
 *   3. R2 - HeadBucket (connectivity)
 *   4. R2 - ListObjects
 *   5. R2 - Upload (PutObject)
 *   6. R2 - Presigned GET URL
 *   7. R2 - Presigned PUT URL
 *   8. R2 - Delete (cleanup)
 */

import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/server/db";

// ─── Colours ─────────────────────────────────────────────────────────────────
const GREEN  = "\x1b[32m✓\x1b[0m";
const RED    = "\x1b[31m✗\x1b[0m";
const YELLOW = "\x1b[33m⚠\x1b[0m";
const BOLD   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM    = (s: string) => `\x1b[2m${s}\x1b[0m`;

function pass(label: string, detail?: string) {
  console.log(`  ${GREEN} ${label}${detail ? DIM("  " + detail) : ""}`);
}
function fail(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`  ${RED} ${label}\n      ${DIM(msg)}`);
}
function skip(label: string, reason: string) {
  console.log(`  ${YELLOW} ${label}  ${DIM("(skipped: " + reason + ")")}`);
}

// ─── 1. Env Vars ──────────────────────────────────────────────────────────────
console.log("\n" + BOLD("1. Environment Variables"));
const required: Record<string, string | undefined> = {
  AUTH_SECRET:          process.env.AUTH_SECRET,
  DATABASE_URL:         process.env.DATABASE_URL,
  R2_ACCOUNT_ID:        process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME:       process.env.R2_BUCKET_NAME,
  R2_PUBLIC_URL:        process.env.R2_PUBLIC_URL,
};
let envOk = true;
for (const [key, val] of Object.entries(required)) {
  if (val) {
    const display = key.includes("SECRET") || key.includes("KEY")
      ? val.slice(0, 8) + "…"
      : val;
    pass(key, display);
  } else {
    fail(key, "not set");
    envOk = false;
  }
}

// ─── 2. Database ──────────────────────────────────────────────────────────────
console.log("\n" + BOLD("2. Database"));
try {
  const userCount   = await db.user.count();
  const travelCount = await db.travelRequest.count();
  const bailoutCount = await db.bailout.count();
  const claimCount  = await db.claim.count();
  pass("Connected",        `${process.env.DATABASE_URL?.split("@")[1] ?? ""}`);
  pass("Users",            `${userCount} rows`);
  pass("Travel Requests",  `${travelCount} rows`);
  pass("Bailouts",         `${bailoutCount} rows`);
  pass("Claims",           `${claimCount} rows`);
  await db.$disconnect();
} catch (e) {
  fail("Database connection", e);
}

// ─── R2 Setup ────────────────────────────────────────────────────────────────
const accountId  = process.env.R2_ACCOUNT_ID;
const accessKey  = process.env.R2_ACCESS_KEY_ID;
const secretKey  = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME ?? "";
const publicUrl  = process.env.R2_PUBLIC_URL ?? "";

const r2ready = accountId && accessKey && secretKey && bucketName;

const r2 = r2ready
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey!, secretAccessKey: secretKey! },
    })
  : null;

const TEST_KEY = `_test/connection-test-${Date.now()}.txt`;
const TEST_BODY = "R2 connection test - safe to delete";

// ─── 3. HeadBucket ───────────────────────────────────────────────────────────
console.log("\n" + BOLD("3. R2 - Bucket Connectivity (HeadBucket)"));
if (!r2) {
  skip("HeadBucket", "R2 env vars missing");
} else {
  try {
    await r2.send(new HeadBucketCommand({ Bucket: bucketName }));
    pass("HeadBucket", `bucket "${bucketName}" exists and is accessible`);
  } catch (e) {
    fail("HeadBucket", e);
  }
}

// ─── 4. ListObjects ───────────────────────────────────────────────────────────
console.log("\n" + BOLD("4. R2 - List Objects"));
if (!r2) {
  skip("ListObjectsV2", "R2 env vars missing");
} else {
  try {
    const res = await r2.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 10 }));
    const count = res.KeyCount ?? 0;
    const keys  = (res.Contents ?? []).map(o => o.Key).join(", ");
    pass("ListObjectsV2", `${count} object(s)${keys ? ": " + keys : ""}`);
  } catch (e) {
    fail("ListObjectsV2", e);
  }
}

// ─── 5. PutObject ────────────────────────────────────────────────────────────
console.log("\n" + BOLD("5. R2 - Upload (PutObject)"));
let uploadedOk = false;
if (!r2) {
  skip("PutObject", "R2 env vars missing");
} else {
  try {
    await r2.send(new PutObjectCommand({
      Bucket:      bucketName,
      Key:         TEST_KEY,
      Body:        TEST_BODY,
      ContentType: "text/plain",
    }));
    uploadedOk = true;
    pass("PutObject", `key: ${TEST_KEY}`);
    const pubLink = publicUrl ? `${publicUrl.replace(/\/$/, "")}/${TEST_KEY}` : null;
    if (pubLink) pass("Public URL", pubLink);
  } catch (e) {
    fail("PutObject", e);
  }
}

// ─── 6. Presigned GET URL ────────────────────────────────────────────────────
console.log("\n" + BOLD("6. R2 - Presigned GET URL"));
if (!r2 || !uploadedOk) {
  skip("Presigned GET", r2 ? "upload failed" : "R2 env vars missing");
} else {
  try {
    const url = await getSignedUrl(r2, new DeleteObjectCommand({ Bucket: bucketName, Key: TEST_KEY }), { expiresIn: 60 });
    // Generate a proper GET presigned URL instead
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const getUrl = await getSignedUrl(r2, new GetObjectCommand({ Bucket: bucketName, Key: TEST_KEY }), { expiresIn: 300 });
    pass("Presigned GET", getUrl.slice(0, 80) + "…");
  } catch (e) {
    fail("Presigned GET", e);
  }
}

// ─── 7. Presigned PUT URL ────────────────────────────────────────────────────
console.log("\n" + BOLD("7. R2 - Presigned PUT URL"));
if (!r2) {
  skip("Presigned PUT", "R2 env vars missing");
} else {
  try {
    const putUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({ Bucket: bucketName, Key: "_test/presigned-upload-test.txt", ContentType: "text/plain" }),
      { expiresIn: 300 },
    );
    pass("Presigned PUT", putUrl.slice(0, 80) + "…");
  } catch (e) {
    fail("Presigned PUT", e);
  }
}

// ─── 8. Delete (cleanup) ──────────────────────────────────────────────────────
console.log("\n" + BOLD("8. R2 - Delete (cleanup test file)"));
if (!r2 || !uploadedOk) {
  skip("DeleteObject", r2 ? "upload failed, nothing to delete" : "R2 env vars missing");
} else {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: bucketName, Key: TEST_KEY }));
    pass("DeleteObject", `${TEST_KEY} removed`);
  } catch (e) {
    fail("DeleteObject", e);
  }
}

console.log("\n" + DIM("─────────────────────────────────────────────") + "\n");
