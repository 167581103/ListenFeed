// Apply a CORS policy to the public media bucket so browsers on the app origins
// can fetch (and range-request) audio from the media CDN. Cross-origin <audio>
// playback works without CORS, but range requests, Web Audio, and fetch()-based
// preloading need it, so we set it explicitly.
//
//   node scripts/configure-cors.mjs [--dry-run]
import { PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { createR2Client, loadR2Config } from "./r2-client.mjs";

// The media bucket serves only PUBLIC content (audio + feed JSON) with no
// credentials, and it's fetched from many origins (production, every unique
// Vercel *.vercel.app preview URL, custom domains, localhost). Allow all origins
// for GET/HEAD so cross-origin fetch() of the feed snapshots works everywhere.
const ALLOWED_ORIGINS = ["*"];

const corsRules = [
  {
    AllowedOrigins: ALLOWED_ORIGINS,
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    MaxAgeSeconds: 3600,
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = loadR2Config();
  console.log("Applying CORS to media bucket for origins:");
  for (const origin of ALLOWED_ORIGINS) console.log(`  - ${origin}`);

  if (dryRun) {
    console.log("[dry-run] not sending PutBucketCors");
    return;
  }

  const client = createR2Client(config);
  await client.send(
    new PutBucketCorsCommand({
      Bucket: config.mediaBucket,
      CORSConfiguration: { CORSRules: corsRules },
    }),
  );

  const current = await client.send(new GetBucketCorsCommand({ Bucket: config.mediaBucket }));
  console.log("\nActive CORS rules:");
  console.log(JSON.stringify(current.CORSRules, null, 2));
}

main().catch((err) => {
  console.error(`configure-cors failed: ${err.message}`);
  process.exit(1);
});
