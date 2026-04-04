import User from '../models/User.js';
import Project from '../models/Project.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Notification from '../models/Notification.js';

/**
 * Release internal escrow: client escrow bucket → freelancer available wallet.
 * @param {import('mongoose').Types.ObjectId|string} projectId
 * @param {{ actingUserId?: import('mongoose').Types.ObjectId|string, autoRelease?: boolean, actingIsAdmin?: boolean }} opts
 */
export async function releaseEscrowForProject(projectId, opts = {}) {
  const { actingUserId, autoRelease = false, actingIsAdmin = false } = opts;

  const project = await Project.findById(projectId);
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  const lock = project.escrowLockedPaise;
  const credit = project.escrowFreelancerCreditPaise;
  if (!Number.isFinite(lock) || lock <= 0 || !Number.isFinite(credit) || credit < 0) {
    const err = new Error('No active escrow for this project');
    err.statusCode = 400;
    throw err;
  }

  if (project.status === 'disputed') {
    const err = new Error('Cannot release funds while the project is disputed');
    err.statusCode = 400;
    throw err;
  }

  if (project.status !== 'in_review') {
    const err = new Error(autoRelease ? 'Project is not awaiting review' : 'Work must be submitted for review before release');
    err.statusCode = 400;
    throw err;
  }

  const clientId = project.client;
  const freelancerId = project.freelancer;
  if (!freelancerId) {
    const err = new Error('No freelancer assigned');
    err.statusCode = 400;
    throw err;
  }

  if (!autoRelease && !actingIsAdmin && String(clientId) !== String(actingUserId)) {
    const err = new Error('Not allowed');
    err.statusCode = 403;
    throw err;
  }

  const clientAfter = await User.findOneAndUpdate(
    { _id: clientId, escrowBalancePaise: { $gte: lock } },
    { $inc: { escrowBalancePaise: -lock } },
    { new: true }
  );
  if (!clientAfter) {
    const err = new Error('Escrow balance insufficient — contact support');
    err.statusCode = 400;
    throw err;
  }

  const freelancerAfter = await User.findByIdAndUpdate(
    freelancerId,
    { $inc: { walletBalancePaise: credit } },
    { new: true }
  );
  if (!freelancerAfter) {
    await User.findByIdAndUpdate(clientId, { $inc: { escrowBalancePaise: lock } });
    const err = new Error('Freelancer not found');
    err.statusCode = 500;
    throw err;
  }

  const meta = {
    projectId: project._id,
    autoRelease,
    escrowLockedPaise: lock,
    escrowFreelancerCreditPaise: credit,
  };

  await WalletTransaction.create([
    {
      user: clientId,
      direction: 'debit',
      amountPaise: lock,
      balanceAfterPaise: clientAfter.walletBalancePaise,
      type: 'escrow_release',
      title: autoRelease ? 'Escrow released (auto after review window)' : 'Escrow released to freelancer',
      meta: { ...meta, escrowBalanceAfterPaise: clientAfter.escrowBalancePaise },
    },
    {
      user: freelancerId,
      direction: 'credit',
      amountPaise: credit,
      balanceAfterPaise: freelancerAfter.walletBalancePaise,
      type: 'escrow_release',
      title: `Payment received (₹${(credit / 100).toFixed(2)})`,
      meta,
    },
  ]);

  project.escrowLockedPaise = null;
  project.escrowFreelancerCreditPaise = null;
  project.status = 'completed';
  project.submissionText = '';
  project.submissionLinks = [];
  project.submittedAt = null;
  await project.save();

  const notifType = autoRelease ? 'escrow_auto_released' : 'escrow_released';
  const notifTitle = autoRelease ? 'Payment auto-released' : 'Payment released';
  const notifBody = autoRelease
    ? `Your escrow for "${project.title}" was auto-released after the review period.`
    : `Your escrow for "${project.title}" was released to the freelancer.`;

  await Notification.create([
    {
      user: clientId,
      type: notifType,
      title: notifTitle,
      body: notifBody,
      link: `/projects/${project._id}`,
      meta,
    },
    {
      user: freelancerId,
      type: 'wallet_credit',
      title: 'Wallet credited',
      body: `₹${(credit / 100).toFixed(2)} added to your wallet (escrow released).`,
      link: '/wallet',
      meta,
    },
  ]);

  return { project, clientAfter, freelancerAfter };
}
