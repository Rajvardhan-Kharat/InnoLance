import express from 'express';
import { body, validationResult } from 'express-validator';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/project/:projectId', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const isClient = project.client.toString() === req.user._id.toString();
    const isFreelancer = project.freelancer?.toString() === req.user._id.toString();
    if (!isClient && !isFreelancer) return res.status(403).json({ message: 'Access denied' });
    const milestones = await Milestone.find({ project: project._id }).sort({ order: 1 }).lean();
    res.json({ milestones });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  '/project/:projectId',
  protect,
  [
    body('title').trim().notEmpty(),
    body('amount').isNumeric(),
    body('description').optional().trim(),
    body('dueDate').optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const project = await Project.findById(req.params.projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (project.client.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Only client can add milestones' });
      }
      if (project.status !== 'in_progress') return res.status(400).json({ message: 'Project must be in progress' });
      if (project.budgetType !== 'fixed') return res.status(400).json({ message: 'Milestones only for fixed-price projects' });
      const count = await Milestone.countDocuments({ project: project._id });
      const milestone = await Milestone.create({
        project: project._id,
        title: req.body.title,
        description: req.body.description,
        amount: Number(req.body.amount),
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        order: count,
      });
      res.status(201).json({ milestone });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.patch('/:id/status', protect, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id).populate('project');
    if (!milestone) return res.status(404).json({ message: 'Milestone not found' });
    const { status } = req.body;
    if (!['pending', 'in_review', 'released'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const isClient = milestone.project.client.toString() === req.user._id.toString();
    const isFreelancer = milestone.project.freelancer?.toString() === req.user._id.toString();
    if (status === 'in_review') {
      if (!isFreelancer) return res.status(403).json({ message: 'Only freelancer can submit for review' });
      milestone.status = 'in_review';
      await Notification.create({
        user: milestone.project.client,
        type: 'milestone_submitted',
        title: 'Milestone submitted for review',
        body: `"${milestone.title}" is ready for your review.`,
        link: `/projects/${milestone.project._id}`,
        meta: { projectId: milestone.project._id, milestoneId: milestone._id },
      });
    } else if (status === 'released') {
      if (!isClient) return res.status(403).json({ message: 'Only client can release milestone' });
      milestone.status = 'released';
      await Notification.create({
        user: milestone.project.freelancer,
        type: 'milestone_released',
        title: 'Milestone released',
        body: `"${milestone.title}" has been approved and released.`,
        link: `/projects/${milestone.project._id}`,
        meta: { projectId: milestone.project._id, milestoneId: milestone._id },
      });
    } else {
      if (!isClient && !isFreelancer) return res.status(403).json({ message: 'Access denied' });
      milestone.status = status;
    }
    await milestone.save();
    res.json({ milestone });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
