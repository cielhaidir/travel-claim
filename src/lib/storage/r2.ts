/**
 * Cloudflare R2 (S3-compatible) storage client.
 *
 * Usage:
 *   import { r2, R2_BUCKET, getPublicUrl, getPresignedUploadUrl } from "@/lib/storage/r2";
 *
 * Environment variables required (all optional → R2 disabled when absent):
 *   R2_ACCOUNT_ID        – Cloudflare account ID
 *   R2_ACCESS_KEY_ID     – R2 Access Key ID
 *   R2_SECRET_ACCESS_KEY – R2 Secret Access Key
 *   R2_BUCKET_NAME       – Target bucket name
 *   R2_PUBLIC_URL        – Public base URL for the bucket (e.g. https://pub-xxx.r2.dev)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

// ─── Client ──────────────────────────────────────────────────────────────────

function createR2Client(): S3Client | null {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY
  ) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/** Lazily-created singleton R2 client. `null` when env vars are missing. */
export const r2 = createR2Client();

/** Configured bucket name (or empty string when not set). */
export const R2_BUCKET = env.R2_BUCKET_NAME ?? "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the public URL for a stored object key.
 * Returns `null` when `R2_PUBLIC_URL` is not configured.
 */
export function getPublicUrl(key: string): string | null {
  if (!env.R2_PUBLIC_URL) return null;
  return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}

/**
 * Generate a pre-signed PUT URL so the client can upload directly to R2
 * without routing the file through the Next.js server.
 *
 * @param key         Object key (path inside the bucket).
 * @param contentType MIME type of the file, e.g. "image/jpeg".
 * @param expiresIn   URL validity in seconds (default: 3600 = 1 hour).
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  if (!r2) {
    throw new Error(
      "R2 client is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2, command, { expiresIn });
}

/**
 * Generate a pre-signed GET URL for a private object.
 *
 * @param key       Object key.
 * @param expiresIn URL validity in seconds (default: 3600).
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  if (!r2) {
    throw new Error("R2 client is not configured.");
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });

  return getSignedUrl(r2, command, { expiresIn });
}

/**
 * Upload a file buffer directly from the server to R2.
 *
 * @param key         Object key (path inside the bucket).
 * @param body        File content as Buffer or Uint8Array.
 * @param contentType MIME type.
 * @param extra       Any additional PutObject parameters.
 * @returns           Public URL (if R2_PUBLIC_URL is set) or the object key.
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  extra?: Partial<PutObjectCommandInput>,
): Promise<{ key: string; url: string | null }> {
  if (!r2) {
    throw new Error("R2 client is not configured.");
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ...extra,
  });

  await r2.send(command);

  return { key, url: getPublicUrl(key) };
}

/**
 * Delete an object from R2.
 *
 * @param key Object key.
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!r2) {
    throw new Error("R2 client is not configured.");
  }

  await r2.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }),
  );
}

/**
 * Derive a storage key from an entity type + id + filename.
 * Example: `bailouts/clxabc123/receipt.pdf`
 */
export function buildStorageKey(
  entityType: "bailouts" | "claims" | "attachments" | string,
  entityId: string,
  filename: string,
): string {
  // Sanitise filename: replace spaces and special chars
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entityType}/${entityId}/${Date.now()}_${safe}`;
}
