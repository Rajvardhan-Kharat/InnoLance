import express from 'express';
import { body, validationResult } from 'express-validator';
import Review from '../models/Review.js';
import Project from '../models/Project.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { userId, projectId } = req.query;
    const q = {};
    if (userId) q.reviewee = userId;
    if (projectId) q.project = projectId;
    const reviews = await Review.find(q)
      .populate('reviewer', 'firstName lastName avatar')
      .populate('project', 'title')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  '/',
  protect,
  [
    body('project').isMongoId(),
    body('reviewee').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { project, reviewee, rating, comment } = req.body;
      const proj = await Project.findById(project);
      if (!proj) return res.status(404).json({ message: 'Project not found' });
      if (proj.status !== 'completed') return res.status(400).json({ message: 'Project must be completed to review' });
      const isClient = proj.client.toString() === req.user._id.toString();
      const isFreelancer = proj.freelancer?.toString() === req.user._id.toString();
      if (!isClient && !isFreelancer) return res.status(403).json({ message: 'You are not part of this project' });
      if (reviewee === req.user._id.toString()) return res.status(400).json({ message: 'Cannot review yourself' });
      const otherParty = isClient ? proj.freelancer : proj.client;
      if (otherParty?.toString() !== reviewee) return res.status(400).json({ message: 'Reviewee must be the other party' });
      const existing = await Review.findOne({ project, reviewer: req.user._id });
      if (existing) return res.status(400).json({ message: 'You already reviewed this project' });
      const role = isClient ? 'freelancer' : 'client';
      const review = await Review.create({
        project,
        reviewer: req.user._id,
        reviewee,
        rating,
        comment: comment || '',
        role,
      });
      const populated = await Review.findById(review._id)
        .populate('reviewer', 'firstName lastName avatar')
        .populate('reviewee', 'firstName lastName avatar');
      res.status(201).json({ review: populated });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

export default router;
