import express from 'express';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const { limit = 20, unreadOnly } = req.query;
    const q = { user: req.user._id };
    if (unreadOnly === 'true') q.read = false;
    const notifications = await Notification.find(q)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/read', protect, async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!n) return res.status(404).json({ message: 'Notification not found' });
    res.json({ notification: n });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/read-all', protect, async (req, res) => {
  await Notification.updateMany({ user: req.user._id }, { read: true });
  res.json({ message: 'All marked as read' });
});

export default router;
