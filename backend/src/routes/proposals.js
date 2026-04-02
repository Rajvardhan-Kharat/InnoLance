import express from 'express';
import { body, validationResult } from 'express-validator';
import Proposal from '../models/Proposal.js';
import Project from '../models/Project.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { protect, restrictTo } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { evaluateProposal } from '../services/aiScoring.js';

const router = express.Router();

function transactionsNotSupported(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  return msg.includes('Transaction numbers are only allowed on a replica set member or mongos');
}

const resumeDir = path.join(process.cwd(), 'uploads', 'resumes');
if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumeDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'resume', ext).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 40) || 'resume';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (ok.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Resume must be a PDF/DOC/DOCX file'));
  },
});

router.get('/', protect, async (req, res) => {
  try {
    const { projectId, status, page = 1, limit = 20 } = req.query;
    const q = {};
    if (projectId) q.project = projectId;
    if (status) q.status = status;
    if (req.user.role === 'freelancer') q.freelancer = req.user._id;
    else if (req.user.role === 'client' || req.user.role === 'admin') {
      const myProjects = await Project.find({ client: req.user._id }).distinct('_id');
      q.project = projectId ? projectId : { $in: myProjects };
    }
    const proposals = await Proposal.find(q)
      .populate('project', 'title budgetType budget budgetMax status client')
      .populate('freelancer', 'firstName lastName avatar headline skills hourlyRate')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();
    const total = await Proposal.countDocuments(q);
    res.json({ proposals, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate('project', 'title description budgetType budget budgetMax status client')
      .populate('freelancer', 'firstName lastName avatar headline bio skills hourlyRate portfolio')
      .lean();
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    const isClient = proposal.project.client.toString() === req.user._id.toString();
    const isFreelancer = proposal.freelancer._id.toString() === req.user._id.toString();
    if (!isClient && !isFreelancer && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json({ proposal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  '/',
  protect,
  restrictTo('freelancer'),
  upload.single('resume'),
  [
    body('project').isMongoId(),
    body('coverLetter').trim().notEmpty(),
    body('bidAmount').isNumeric(),
    body('estimatedDays').optional().isInt({ min: 1 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { project, coverLetter, bidAmount, estimatedDays } = req.body;
      const proj = await Project.findById(project);
      if (!proj) return res.status(404).json({ message: 'Project not found' });
      if (proj.status !== 'open') return res.status(400).json({ message: 'Project is not open for proposals' });
      const existing = await Proposal.findOne({ project, freelancer: req.user._id });
      if (existing) return res.status(400).json({ message: 'You already submitted a proposal' });

      const resume = req.file ? {
        url: `/uploads/resumes/${req.file.filename}`,
        name: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
      } : undefined;

      // AI Proposal Scoring
      const { score, feedback } = await evaluateProposal(
        proj.title,
        proj.description || '',
        coverLetter
      );

      const proposal = await Proposal.create({
        project,
        freelancer: req.user._id,
        coverLetter,
        bidAmount: Number(bidAmount),
        estimatedDays: estimatedDays ? Number(estimatedDays) : undefined,
        resume,
        attachments: [],
        aiScore: score,
        aiFeedback: feedback,
      });
      await Notification.create({
        user: proj.client,
        type: 'proposal_received',
        title: 'New proposal received',
        body: `You have a new proposal on "${proj.title}".${resume ? ' (Resume attached)' : ''}`,
        link: `/projects/${project}`,
        meta: { projectId: project, proposalId: proposal._id },
      });
      const populated = await Proposal.findById(proposal._id)
        .populate('project', 'title budgetType budget')
        .populate('freelancer', 'firstName lastName avatar headline');
      res.status(201).json({ proposal: populated });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.patch('/:id/accept', protect, restrictTo('client', 'admin'), async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id).populate('project');
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    if (proposal.project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    if (proposal.status !== 'pending') return res.status(400).json({ message: 'Proposal not in pending state' });

    // Wallet transfer rules (INR):
    // - Client pays: bidAmount + ₹50 platform fee
    // - Freelancer receives: bidAmount - ₹50 platform fee
    // Platform keeps ₹100 total (₹50 from client + ₹50 from freelancer side).
    const bidINR = Number(proposal.bidAmount);
    if (!Number.isFinite(bidINR) || bidINR <= 0) {
      return res.status(400).json({ message: 'Invalid bid amount' });
    }
    
    const isAdmin = req.user.role === 'admin';
    const clientFeeINR = isAdmin ? 0 : 50;
    const freelancerFeeINR = isAdmin ? 0 : 50;

    const debitPaise = Math.round((bidINR + clientFeeINR) * 100);
    const creditPaise = Math.max(0, Math.round((bidINR - freelancerFeeINR) * 100));

    try {
      // Standalone MongoDB doesn't support transactions. Use atomic wallet operations.
      const meta = { projectId: proposal.project._id, proposalId: proposal._id, bidINR, feeINR: clientFeeINR };

      // 1) Debit client atomically if enough balance (Admins bypass balance limit)
      let clientAfter;
      if (isAdmin) {
        clientAfter = await User.findOneAndUpdate(
          { _id: req.user._id },
          { $inc: { walletBalancePaise: -debitPaise } },
          { new: true }
        );
      } else {
        clientAfter = await User.findOneAndUpdate(
          { _id: req.user._id, walletBalancePaise: { $gte: debitPaise } },
          { $inc: { walletBalancePaise: -debitPaise } },
          { new: true }
        );
      }
      
      if (!clientAfter) {
        const current = await User.findById(req.user._id).select('walletBalancePaise').lean();
        const have = (current?.walletBalancePaise || 0);
        return res.status(400).json({
          message: `Insufficient wallet balance. Need ₹${((debitPaise - have) / 100).toFixed(2)} more.`,
        });
      }

      // 2) Credit freelancer
      const freelancerAfter = await User.findByIdAndUpdate(
        proposal.freelancer,
        { $inc: { walletBalancePaise: creditPaise } },
        { new: true }
      );
      if (!freelancerAfter) {
        // Compensation: refund client
        await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalancePaise: debitPaise } });
        return res.status(500).json({ message: 'Freelancer not found. Refunded client wallet.' });
      }

      // 3) Ledger
      await WalletTransaction.create([{
        user: req.user._id,
        direction: 'debit',
        amountPaise: debitPaise,
        balanceAfterPaise: clientAfter.walletBalancePaise,
        type: 'proposal_accept_debit',
        title: `Hired freelancer (₹${bidINR.toFixed(2)} + ₹${clientFeeINR} fee)`,
        meta,
      }, {
        user: proposal.freelancer,
        direction: 'credit',
        amountPaise: creditPaise,
        balanceAfterPaise: freelancerAfter.walletBalancePaise,
        type: 'proposal_accept_credit',
        title: `Project funded (₹${bidINR.toFixed(2)} - ₹${freelancerFeeINR} fee)`,
        meta,
      }]);

      // 4) Accept proposal + update project + reject others
      proposal.status = 'accepted';
      await proposal.save();

      await Project.findByIdAndUpdate(proposal.project._id, {
        freelancer: proposal.freelancer,
        status: 'in_progress',
      });

      await Proposal.updateMany(
        { project: proposal.project._id, _id: { $ne: proposal._id } },
        { status: 'rejected' }
      );

      // 5) Notifications
      await Notification.create([{
        user: proposal.freelancer,
        type: 'proposal_accepted',
        title: 'Proposal accepted',
        body: `Your proposal on "${proposal.project.title}" was accepted.`,
        link: `/projects/${proposal.project._id}`,
        meta: { projectId: proposal.project._id, proposalId: proposal._id },
      }, {
        user: proposal.freelancer,
        type: 'wallet_credit',
        title: 'Wallet credited',
        body: `₹${(creditPaise / 100).toFixed(2)} added to your wallet (platform fee applied).`,
        link: '/wallet',
        meta: { projectId: proposal.project._id, proposalId: proposal._id },
      }]);

      const updated = await Proposal.findById(proposal._id)
        .populate('project')
        .populate('freelancer', 'firstName lastName avatar headline');
      res.json({ proposal: updated });
    } catch (err) {
      // If this is a transaction error from an older path, surface a clearer message.
      if (transactionsNotSupported(err)) {
        return res.status(500).json({ message: 'MongoDB transactions not supported on standalone. Restart backend after update.' });
      }
      const code = err.statusCode || 500;
      res.status(code).json({ message: err.message });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/reject', protect, async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id).populate('project');
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    const isClient = proposal.project.client.toString() === req.user._id.toString();
    const isFreelancer = proposal.freelancer.toString() === req.user._id.toString();
    if (!isClient && !isFreelancer) return res.status(403).json({ message: 'Not allowed' });
    if (proposal.status !== 'pending') return res.status(400).json({ message: 'Proposal not in pending state' });
    proposal.status = isFreelancer ? 'withdrawn' : 'rejected';
    await proposal.save();
    res.json({ proposal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
