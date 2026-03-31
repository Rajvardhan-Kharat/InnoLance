import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await User.findById(decoded.id).select('_id firstName lastName');
      if (!user) return next(new Error('User not found'));
      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on('join_conversation', async (conversationId, cb) => {
      try {
        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.participants.some((p) => p.toString() === socket.userId)) {
          if (cb) cb({ error: 'Access denied' });
          return;
        }
        socket.leaveAll();
        socket.join(`user:${socket.userId}`);
        socket.join(`conversation:${conversationId}`);
        socket.currentConversationId = conversationId;
        if (cb) cb({ ok: true });
      } catch (e) {
        if (cb) cb({ error: e.message });
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      socket.currentConversationId = null;
    });

    socket.on('typing_start', (conversationId) => {
      if (socket.currentConversationId !== conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('typing', { userId: socket.userId, name: socket.user?.firstName });
    });

    socket.on('typing_stop', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('typing_stopped', { userId: socket.userId });
    });

    socket.on('send_message', async (payload, cb) => {
      const { conversationId, body } = payload || {};
      if (!conversationId || !body?.trim()) {
        if (cb) cb({ error: 'conversationId and body required' });
        return;
      }
      try {
        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.participants.some((p) => p.toString() === socket.userId)) {
          if (cb) cb({ error: 'Access denied' });
          return;
        }
        const message = await Message.create({
          conversation: convo._id,
          sender: socket.userId,
          body: body.trim(),
        });
        await Conversation.findByIdAndUpdate(convo._id, { lastMessageAt: new Date() });
        const otherIds = convo.participants.filter((p) => p.toString() !== socket.userId);
        for (const uid of otherIds) {
          await Notification.create({
            user: uid,
            type: 'new_message',
            title: 'New message',
            body: body.trim().slice(0, 80),
            link: '/messages',
            meta: { conversationId: convo._id },
          });
        }
        const populated = await Message.findById(message._id).populate('sender', 'firstName lastName avatar').lean();
        io.to(`conversation:${conversationId}`).emit('new_message', populated);
        if (cb) cb({ message: populated });
      } catch (e) {
        if (cb) cb({ error: e.message });
      }
    });

    // WebRTC signaling
    socket.on('webrtc_offer', ({ toUserId, offer }) => {
      io.to(`user:${toUserId}`).emit('webrtc_offer', { fromUserId: socket.userId, fromName: socket.user?.firstName, offer });
    });
    socket.on('webrtc_answer', ({ toUserId, answer }) => {
      io.to(`user:${toUserId}`).emit('webrtc_answer', { fromUserId: socket.userId, answer });
    });
    socket.on('webrtc_ice', ({ toUserId, candidate }) => {
      io.to(`user:${toUserId}`).emit('webrtc_ice', { fromUserId: socket.userId, candidate });
    });
    socket.on('webrtc_hangup', ({ toUserId }) => {
      io.to(`user:${toUserId}`).emit('webrtc_hangup', { fromUserId: socket.userId });
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIo() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
