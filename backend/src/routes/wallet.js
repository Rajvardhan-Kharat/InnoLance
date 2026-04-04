import express from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import User from '../models/User.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
 
function isTransactionsNotSupported(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  return msg.includes('Transaction numbers are only allowed on a replica set member or mongos');
}

router.use(protect);

router.get('/balance', async (req, res) => {
  const available = req.user.walletBalancePaise || 0;
  const escrow = req.user.escrowBalancePaise || 0;
  res.json({
    balancePaise: available,
    balanceINR: (available / 100).toFixed(2),
    escrowBalancePaise: escrow,
    escrowBalanceINR: (escrow / 100).toFixed(2),
  });
});

router.get('/transactions', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const txns = await WalletTransaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Number(limit) || 20))
      .lean();
    res.json({ transactions: txns });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Demo top-up: increments wallet balance.
router.post(
  '/topup',
  [body('amountINR').isNumeric()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const amountINR = Number(req.body.amountINR);
    if (amountINR <= 0) return res.status(400).json({ message: 'amountINR must be > 0' });
    const amountPaise = Math.round(amountINR * 100);
    if (amountPaise < 100) return res.status(400).json({ message: 'Minimum top-up is ₹1.00' });

    try {
      // Standalone MongoDB doesn't support transactions. Use atomic update + ledger insert.
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { walletBalancePaise: amountPaise } },
        { new: true }
      );
      await WalletTransaction.create({
        user: req.user._id,
        direction: 'credit',
        amountPaise,
        balanceAfterPaise: updatedUser.walletBalancePaise,
        type: 'topup',
        title: 'Wallet top-up',
        meta: { amountINR },
      });

      res.status(201).json({
        balancePaise: updatedUser.walletBalancePaise,
        balanceINR: (updatedUser.walletBalancePaise / 100).toFixed(2),
        escrowBalancePaise: updatedUser.escrowBalancePaise || 0,
        escrowBalanceINR: ((updatedUser.escrowBalancePaise || 0) / 100).toFixed(2),
      });
    } catch (err) {
      // Keep a helpful message if someone later enables transactions.
      res.status(500).json({ message: err.message });
    }
  }
);

// Demo withdraw: decrements wallet balance.
router.post(
  '/withdraw',
  [body('amountINR').isNumeric()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const amountINR = Number(req.body.amountINR);
    if (amountINR <= 0) return res.status(400).json({ message: 'amountINR must be > 0' });
    const amountPaise = Math.round(amountINR * 100);
    if (amountPaise < 100) return res.status(400).json({ message: 'Minimum withdraw is ₹1.00' });

    try {
      // Atomic conditional decrement to prevent negative balance.
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id, walletBalancePaise: { $gte: amountPaise } },
        { $inc: { walletBalancePaise: -amountPaise } },
        { new: true }
      );
      if (!updatedUser) return res.status(400).json({ message: 'Insufficient wallet balance' });

      await WalletTransaction.create({
        user: req.user._id,
        direction: 'debit',
        amountPaise,
        balanceAfterPaise: updatedUser.walletBalancePaise,
        type: 'withdraw',
        title: 'Wallet withdrawal',
        meta: { amountINR },
      });

      res.status(201).json({
        balancePaise: updatedUser.walletBalancePaise,
        balanceINR: (updatedUser.walletBalancePaise / 100).toFixed(2),
        escrowBalancePaise: updatedUser.escrowBalancePaise || 0,
        escrowBalanceINR: ((updatedUser.escrowBalancePaise || 0) / 100).toFixed(2),
      });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ message: err.message });
    }
  }
);

// Internal transfer helper (exported for other routes if needed later)
export async function transferWallet({
  session,
  fromUserId,
  toUserId,
  debitPaise,
  creditPaise,
  titleDebit,
  titleCredit,
  meta,
}) {
  const from = await User.findById(fromUserId).session(session);
  const to = await User.findById(toUserId).session(session);
  if (!from || !to) throw new Error('User not found');
  if ((from.walletBalancePaise || 0) < debitPaise) {
    const err = new Error('Insufficient wallet balance');
    err.statusCode = 400;
    throw err;
  }

  from.walletBalancePaise -= debitPaise;
  to.walletBalancePaise += creditPaise;
  await from.save({ session });
  await to.save({ session });

  await WalletTransaction.create([{
    user: from._id,
    direction: 'debit',
    amountPaise: debitPaise,
    balanceAfterPaise: from.walletBalancePaise,
    type: 'proposal_accept_debit',
    title: titleDebit,
    meta,
  }, {
    user: to._id,
    direction: 'credit',
    amountPaise: creditPaise,
    balanceAfterPaise: to.walletBalancePaise,
    type: 'proposal_accept_credit',
    title: titleCredit,
    meta,
  }], { session });

  await Notification.create([{
    user: to._id,
    type: 'wallet_credit',
    title: 'Wallet credited',
    body: `₹${(creditPaise / 100).toFixed(2)} added to your wallet.`,
    link: '/settings',
    meta,
  }], { session });

  return { from, to };
}

export default router;

