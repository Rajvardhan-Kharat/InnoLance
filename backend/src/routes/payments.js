import express from 'express';
import Stripe from 'stripe';
import Payment from '../models/Payment.js';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import Notification from '../models/Notification.js';
import { protect, restrictTo } from '../middleware/auth.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

const router = express.Router();

// Demo/simulate payment when Stripe not configured
router.post('/milestone/:milestoneId/demo-pay', protect, restrictTo('client'), async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.milestoneId).populate('project');
    if (!milestone) return res.status(404).json({ message: 'Milestone not found' });
    if (milestone.project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your project' });
    }
    if (milestone.status !== 'in_review') return res.status(400).json({ message: 'Milestone must be in review to pay' });
    const existing = await Payment.findOne({ milestone: milestone._id, status: { $in: ['held', 'released'] } });
    if (existing) return res.status(400).json({ message: 'Milestone already paid' });
    const amountCents = Math.round(milestone.amount * 100);
    const payment = await Payment.create({
      project: milestone.project._id,
      milestone: milestone._id,
      payer: req.user._id,
      payee: milestone.project.freelancer,
      amount: amountCents,
      type: 'milestone',
      status: 'released',
    });
    milestone.status = 'released';
    await milestone.save();
    if (payment.payee) {
      await Notification.create({
        user: payment.payee,
        type: 'milestone_released',
        title: 'Payment received',
        body: `₹${milestone.amount.toFixed(2)} has been released for your milestone.`,
        link: `/projects/${milestone.project._id}`,
        meta: { paymentId: payment._id },
      });
    }
    res.json({ payment, message: 'Demo payment completed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create payment intent for milestone (client funds escrow)
router.post('/milestone/:milestoneId/create-intent', protect, restrictTo('client'), async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ message: 'Payments not configured. Add STRIPE_SECRET_KEY to .env' });
    const milestone = await Milestone.findById(req.params.milestoneId).populate('project');
    if (!milestone) return res.status(404).json({ message: 'Milestone not found' });
    if (milestone.project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your project' });
    }
    if (milestone.status !== 'in_review') return res.status(400).json({ message: 'Milestone must be in review to pay' });
    const existing = await Payment.findOne({ milestone: milestone._id, status: { $in: ['held', 'released'] } });
    if (existing) return res.status(400).json({ message: 'Milestone already paid' });
    const amountCents = Math.round(milestone.amount * 100);
    if (amountCents < 50) return res.status(400).json({ message: 'Minimum amount is ₹0.50' });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'inr',
      metadata: {
        milestoneId: milestone._id.toString(),
        projectId: milestone.project._id.toString(),
        freelancerId: milestone.project.freelancer?.toString(),
      },
    });
    const payment = await Payment.create({
      project: milestone.project._id,
      milestone: milestone._id,
      payer: req.user._id,
      payee: milestone.project.freelancer,
      amount: amountCents,
      type: 'milestone',
      status: 'pending',
      stripePaymentIntentId: paymentIntent.id,
    });
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Stripe webhook (payment_intent.succeeded) - raw body is applied in server.js
router.post('/webhook', async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Webhook not configured');
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const payment = await Payment.findOne({ stripePaymentIntentId: pi.id });
    if (payment) {
      payment.status = 'held';
      await payment.save();
      const milestone = await Milestone.findById(payment.milestone);
      if (milestone) {
        milestone.status = 'released';
        await milestone.save();
      }
      if (payment.payee) {
        await Notification.create({
          user: payment.payee,
          type: 'milestone_released',
          title: 'Payment received',
          body: `₹${(payment.amount / 100).toFixed(2)} has been released for your milestone.`,
          link: `/projects/${payment.project}`,
          meta: { paymentId: payment._id },
        });
      }
    }
  }
  res.json({ received: true });
});

// Release held payment (admin or client - for demo, marks as released in DB; production would transfer via Connect)
router.post('/:paymentId/release', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId).populate('project');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    const isClient = payment.payer.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isClient && !isAdmin) return res.status(403).json({ message: 'Not allowed' });
    if (payment.status !== 'held') return res.status(400).json({ message: 'Payment not in held state' });
    payment.status = 'released';
    await payment.save();
    const milestone = await Milestone.findById(payment.milestone);
    if (milestone) {
      milestone.status = 'released';
      await milestone.save();
    }
    res.json({ payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List payments for user
router.get('/', protect, async (req, res) => {
  try {
    const q = req.user.role === 'admin' ? {} : { $or: [{ payer: req.user._id }, { payee: req.user._id }] };
    const payments = await Payment.find(q)
      .populate('project', 'title')
      .populate('milestone', 'title')
      .populate('payer', 'firstName lastName')
      .populate('payee', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
