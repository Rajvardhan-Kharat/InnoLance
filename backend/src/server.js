import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { initSocket } from './socket/index.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import proposalRoutes from './routes/proposals.js';
import messageRoutes from './routes/messages.js';
import reviewRoutes from './routes/reviews.js';
import milestoneRoutes from './routes/milestones.js';
import recommendationRoutes from './routes/recommendations.js';
import notificationRoutes from './routes/notifications.js';
import paymentRoutes from './routes/payments.js';
import timeEntryRoutes from './routes/timeEntries.js';
import adminRoutes from './routes/admin.js';
import walletRoutes from './routes/wallet.js';
import enterpriseRfpRoutes from './routes/enterpriseRfp.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { startListener } from './scripts/emailListener.js';

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
// Stripe webhook needs raw body - must be before json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/enterprise-rfp', enterpriseRfpRoutes);

// Serve uploaded files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freelance_platform')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initSocket(httpServer);
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  if (process.env.IMAP_PASSWORD && process.env.IMAP_PASSWORD !== 'your_16_char_app_password') {
    startListener().catch(err => console.error('Failed to start email listener:', err));
  } else {
    console.warn('\n⚠️ IMAP listener not started due to missing IMAP_PASSWORD in .env ⚠️\n');
  }
});

export default app;
