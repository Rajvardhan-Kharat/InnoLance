import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Project from '../models/Project.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/conversations', protect, async (req, res) => {
  try {
    const convos = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'firstName lastName avatar companyName')
      .populate('project', 'title status')
      .sort({ lastMessageAt: -1 })
      .lean();
    const withLast = await Promise.all(
      convos.map(async (c) => {
        const last = await Message.findOne({ conversation: c._id }).sort({ createdAt: -1 }).lean();
        const unread = await Message.countDocuments({ conversation: c._id, sender: { $ne: req.user._id }, read: false });
        return { ...c, lastMessage: last, unreadCount: unread };
      })
    );
    res.json({ conversations: withLast });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/conversations', protect, async (req, res) => {
  try {
    const { otherUserId, projectId } = req.body;
    if (!otherUserId) return res.status(400).json({ message: 'otherUserId required' });
    const participants = [req.user._id.toString(), otherUserId].sort();
    let convo = await Conversation.findOne({ participants });
    if (!convo) {
      convo = await Conversation.create({
        participants: [req.user._id, otherUserId],
        project: projectId || undefined,
      });
    }
    const populated = await Conversation.findById(convo._id)
      .populate('participants', 'firstName lastName avatar companyName')
      .populate('project', 'title status');
    res.status(201).json({ conversation: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/conversations/:id/messages', protect, async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const messages = await Message.find({ conversation: convo._id })
      .populate('sender', 'firstName lastName avatar')
      .sort({ createdAt: 1 })
      .lean();
    await Message.updateMany(
      { conversation: convo._id, sender: { $ne: req.user._id } },
      { read: true }
    );
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/conversations/:id/messages', protect, async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ message: 'Message body required' });
    const message = await Message.create({
      conversation: convo._id,
      sender: req.user._id,
      body: body.trim(),
    });
    await Conversation.findByIdAndUpdate(convo._id, { lastMessageAt: new Date() });
    const otherParticipantIds = convo.participants.filter((p) => p.toString() !== req.user._id.toString());
    for (const userId of otherParticipantIds) {
      await Notification.create({
        user: userId,
        type: 'new_message',
        title: 'New message',
        body: (req.body.body || '').slice(0, 80) || 'You have a new message.',
        link: '/messages',
        meta: { conversationId: convo._id },
      });
    }
    const populated = await Message.findById(message._id).populate('sender', 'firstName lastName avatar');
    res.status(201).json({ message: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
