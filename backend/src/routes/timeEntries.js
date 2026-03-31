import express from 'express';
import { body, validationResult } from 'express-validator';
import TimeEntry from '../models/TimeEntry.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Payment from '../models/Payment.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

function startOfWeekMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + diff);
  return date;
}

router.get('/', protect, async (req, res) => {
  try {
    const { projectId, status } = req.query;
    const q = {};
    if (projectId) q.project = projectId;
    if (status) q.status = status;
    if (req.user.role === 'freelancer') q.freelancer = req.user._id;
    else if (req.user.role === 'client') {
      const myProjects = await Project.find({ client: req.user._id }).distinct('_id');
      q.project = { $in: myProjects };
    }
    const entries = await TimeEntry.find(q)
      .populate('project', 'title')
      .populate('freelancer', 'firstName lastName')
      .sort({ date: -1 })
      .lean();
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  '/',
  protect,
  [
    body('project').isMongoId(),
    body('minutes').isInt({ min: 1 }),
    body('description').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const project = await Project.findById(req.body.project);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (project.freelancer?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not the project freelancer' });
      }
      if (project.budgetType !== 'hourly') return res.status(400).json({ message: 'Project must be hourly' });
      if (project.status !== 'in_progress') return res.status(400).json({ message: 'Project must be in progress' });

      // Weekly max limit enforcement (optional)
      if (project.weeklyMaxMinutes !== undefined && project.weeklyMaxMinutes !== null) {
        const weekStart = startOfWeekMonday(new Date());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const agg = await TimeEntry.aggregate([
          {
            $match: {
              project: project._id,
              freelancer: req.user._id,
              date: { $gte: weekStart, $lt: weekEnd },
            },
          },
          { $group: { _id: null, totalMinutes: { $sum: '$minutes' } } },
        ]);
        const used = agg?.[0]?.totalMinutes || 0;
        const nextTotal = used + Number(req.body.minutes);
        if (nextTotal > Number(project.weeklyMaxMinutes)) {
          return res.status(400).json({
            message: `Weekly limit exceeded. Used ${used} min, adding ${req.body.minutes} would exceed max ${project.weeklyMaxMinutes} min.`,
          });
        }
      }

      const hourlyRate = req.user.hourlyRate || project.budget || 0;
      if (!hourlyRate) return res.status(400).json({ message: 'Hourly rate not set' });
      const amount = (req.body.minutes / 60) * hourlyRate;
      const entry = await TimeEntry.create({
        project: project._id,
        freelancer: req.user._id,
        minutes: req.body.minutes,
        hourlyRate,
        amount,
        description: req.body.description,
      });
      const populated = await TimeEntry.findById(entry._id)
        .populate('project', 'title')
        .populate('freelancer', 'firstName lastName');
      res.status(201).json({ entry: populated });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.patch('/:id/approve', protect, async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.id).populate('project');
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    if (entry.project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not the project client' });
    }
    if (entry.status !== 'pending') return res.status(400).json({ message: 'Entry not pending' });
    entry.status = 'approved';
    await entry.save();
    res.json({ entry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/mark-paid', protect, async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.id).populate('project');
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    if (entry.project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not the project client' });
    }
    if (entry.status !== 'approved') return res.status(400).json({ message: 'Entry must be approved first' });
    if (!entry.project.freelancer) return res.status(400).json({ message: 'No freelancer assigned' });

    const amountPaise = Math.max(1, Math.round(Number(entry.amount) * 100));
    const meta = { projectId: entry.project._id, timeEntryId: entry._id, type: 'hourly' };

    // Debit client wallet atomically
    const clientAfter = await User.findOneAndUpdate(
      { _id: req.user._id, walletBalancePaise: { $gte: amountPaise } },
      { $inc: { walletBalancePaise: -amountPaise } },
      { new: true }
    );
    if (!clientAfter) return res.status(400).json({ message: 'Insufficient wallet balance to pay this time entry' });

    // Credit freelancer
    const freelancerAfter = await User.findByIdAndUpdate(
      entry.project.freelancer,
      { $inc: { walletBalancePaise: amountPaise } },
      { new: true }
    );
    if (!freelancerAfter) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalancePaise: amountPaise } });
      return res.status(500).json({ message: 'Freelancer not found. Refunded client wallet.' });
    }

    await WalletTransaction.create([{
      user: req.user._id,
      direction: 'debit',
      amountPaise,
      balanceAfterPaise: clientAfter.walletBalancePaise,
      type: 'proposal_accept_debit',
      title: `Hourly payment for ${entry.minutes} min`,
      meta,
    }, {
      user: entry.project.freelancer,
      direction: 'credit',
      amountPaise,
      balanceAfterPaise: freelancerAfter.walletBalancePaise,
      type: 'proposal_accept_credit',
      title: `Hourly earnings for ${entry.minutes} min`,
      meta,
    }]);

    await Payment.create({
      project: entry.project._id,
      payer: req.user._id,
      payee: entry.project.freelancer,
      amount: amountPaise,
      currency: 'inr',
      type: 'hourly',
      status: 'released',
      metadata: { timeEntryId: entry._id },
    });

    entry.status = 'paid';
    await entry.save();

    await Notification.create({
      user: entry.project.freelancer,
      type: 'wallet_credit',
      title: 'Hourly payment received',
      body: `₹${(amountPaise / 100).toFixed(2)} added to your wallet for approved time.`,
      link: '/wallet',
      meta,
    });

    res.json({ entry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
