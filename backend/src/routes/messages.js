import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Project from '../models/Project.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import { getIo } from '../socket/index.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const messageUploadsDir = path.join(process.cwd(), 'uploads', 'messages');
if (!fs.existsSync(messageUploadsDir)) fs.mkdirSync(messageUploadsDir, { recursive: true });

const messageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, messageUploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'file', ext).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 40) || 'file';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`);
  },
});
const uploadMessageAttachments = multer({
  storage: messageStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

async function resolveConversation({ me, otherUserId, projectId }) {
  const q = {
    participants: { $all: [me, otherUserId] },
    $expr: { $eq: [{ $size: '$participants' }, 2] },
  };
  if (projectId) q.project = projectId;
  else q.project = null;

  let convo = await Conversation.findOne(q);
  if (!convo) {
    convo = await Conversation.create({
      participants: [me, otherUserId],
      project: projectId || null,
    });
  }
  return convo;
}

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
    let normalizedProjectId = null;
    if (projectId) {
      const exists = await Project.findById(projectId).select('_id').lean();
      if (!exists) return res.status(404).json({ message: 'Project not found' });
      normalizedProjectId = projectId;
    }
    const convo = await resolveConversation({
      me: req.user._id,
      otherUserId,
      projectId: normalizedProjectId,
    });

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
    const unreadBefore = await Message.find(
      { conversation: convo._id, sender: { $ne: req.user._id }, read: false },
      { _id: 1 }
    ).lean();
    if (unreadBefore.length > 0) {
      const now = new Date();
      await Message.updateMany(
        { _id: { $in: unreadBefore.map((m) => m._id) } },
        { read: true, readAt: now }
      );
      try {
        const io = getIo();
        io.to(`conversation:${convo._id}`).emit('read_receipt', {
          conversationId: convo._id.toString(),
          readerId: req.user._id.toString(),
          messageIds: unreadBefore.map((m) => m._id.toString()),
          readAt: now.toISOString(),
        });
      } catch {}
    }
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/conversations/:id/messages', protect, uploadMessageAttachments.array('attachments', 5), async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const body = String(req.body?.body || '').trim();
    const attachments = Array.isArray(req.files)
      ? req.files.map((f) => ({
        url: `/uploads/messages/${f.filename}`,
        name: f.originalname,
      }))
      : [];
    if (!body && attachments.length === 0) return res.status(400).json({ message: 'Message body or attachment required' });

    const message = await Message.create({
      conversation: convo._id,
      sender: req.user._id,
      body,
      attachments,
    });
    await Conversation.findByIdAndUpdate(convo._id, { lastMessageAt: new Date() });
    const otherParticipantIds = convo.participants.filter((p) => p.toString() !== req.user._id.toString());
    for (const userId of otherParticipantIds) {
      await Notification.create({
        user: userId,
        type: 'new_message',
        title: 'New message',
        body: body.slice(0, 80) || (attachments.length > 0 ? `Sent ${attachments.length} attachment(s).` : 'You have a new message.'),
        link: '/messages',
        meta: { conversationId: convo._id },
      });
    }
    const populated = await Message.findById(message._id).populate('sender', 'firstName lastName avatar');
    try {
      const io = getIo();
      io.to(`conversation:${convo._id}`).emit('new_message', populated.toObject ? populated.toObject() : populated);
    } catch {}
    res.status(201).json({ message: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
