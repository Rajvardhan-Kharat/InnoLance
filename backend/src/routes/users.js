import express from 'express';
import User from '../models/User.js';
import Review from '../models/Review.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', protect, async (req, res) => {
  try {
    const allowed = [
      'firstName', 'lastName', 'avatar', 'phone', 'companyName',
      'headline', 'bio', 'skills', 'hourlyRate', 'portfolio', 'experience', 'education', 'certifications', 'availability'
    ];
    const updates = {};
    Object.keys(req.body).forEach((k) => { if (allowed.includes(k)) updates[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const reviews = await Review.find({ reviewee: user._id }).populate('reviewer', 'firstName lastName avatar').sort({ createdAt: -1 }).limit(10);
    const avgRating = await Review.aggregate([{ $match: { reviewee: user._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
    res.json({
      user,
      reviews,
      rating: avgRating[0] ? { avg: avgRating[0].avg, count: avgRating[0].count } : { avg: 0, count: 0 },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (role) query.role = role;
    if (search) query.$or = [{ email: new RegExp(search, 'i') }, { firstName: new RegExp(search, 'i') }, { lastName: new RegExp(search, 'i') }];
    const users = await User.find(query).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
    const total = await User.countDocuments(query);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
