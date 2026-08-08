// R2 access for ops/CMS tooling. R2 speaks the S3 API, so the standard AWS SDK
// works unchanged once pointed at the account endpoint. This module is only ever
// run from Node scripts (never imported by the static Next.js client), so the
// credentials it reads stay on the server side and never reach the browser.
import { S3Client } from "@aws-sdk/client-s3";

// Only these are needed to sign uploads/reads. The public media base is a
// separate, optional concept (browsers fetch from it) resolved below.
const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_MEDIA",
  "R2_BUCKET_MASTERS",
];

/**
 * Resolve the PUBLIC base URL browsers use to fetch optimized media. This is NOT
 * the S3 API endpoint. Prefer an explicit public value; fall back to
 * R2_PUBLIC_BASE_URL only if it is clearly not the S3 endpoint.
 */
function resolvePublicBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.R2_PUBLIC_MEDIA_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const legacy = process.env.R2_PUBLIC_BASE_URL ?? "";
  if (legacy && !legacy.includes(".r2.cloudflarestorage.com")) return legacy.replace(/\/$/, "");
  return "";
}

export function loadR2Config() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required R2 environment variable(s): ${missing.join(", ")}. ` +
        "Set them in Cloud Agents Secrets (never commit them).",
    );
  }

  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    mediaBucket: process.env.R2_BUCKET_MEDIA,
    mastersBucket: process.env.R2_BUCKET_MASTERS,
    // Public CDN base for the optimized media bucket (e.g. media.listenfeed.online
    // or a pub-*.r2.dev URL). Empty until public access is configured.
    publicBaseUrl: resolvePublicBaseUrl(),
  };
}

export function createR2Client(config = loadR2Config()) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/** Absolute, browser-facing URL for an object key in the public media bucket. */
export function publicUrl(config, key) {
  const relative = `/${key.replace(/^\//, "")}`;
  if (!config.publicBaseUrl) {
    return `${relative}  (set NEXT_PUBLIC_MEDIA_BASE_URL to a public base)`;
  }
  return `${config.publicBaseUrl}${relative}`;
}
