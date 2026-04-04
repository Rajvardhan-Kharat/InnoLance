import Project from '../models/Project.js';
import { releaseEscrowForProject } from './escrowService.js';

const DEFAULT_DAYS = 7;

/**
 * @returns {{ released: number, failed: number, candidates: number }}
 */
export async function runEscrowAutoReleaseJob() {
  const days = Number(process.env.ESCROW_AUTO_RELEASE_DAYS || DEFAULT_DAYS);
  const ms = days * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - ms);

  const candidates = await Project.find({
    status: 'in_review',
    submittedAt: { $lte: cutoff },
    escrowLockedPaise: { $gt: 0 },
  })
    .select('_id')
    .lean();

  let released = 0;
  let failed = 0;
  for (const p of candidates) {
    try {
      await releaseEscrowForProject(p._id, { autoRelease: true });
      released += 1;
    } catch {
      failed += 1;
    }
  }

  return { released, failed, candidates: candidates.length };
}
