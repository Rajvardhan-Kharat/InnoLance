/**
 * Auto-release internal escrow for projects in_review with submitted_at older than ESCROW_AUTO_RELEASE_DAYS (default 7).
 * Run via cron, e.g. daily:
 *   node backend/src/scripts/escrowAutoRelease.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { runEscrowAutoReleaseJob } from '../services/escrowAutoReleaseJob.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/freelance_platform';
  await mongoose.connect(uri);
  const r = await runEscrowAutoReleaseJob();
  console.log(
    `Escrow auto-release: candidates=${r.candidates}, released=${r.released}, failed=${r.failed}`
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
