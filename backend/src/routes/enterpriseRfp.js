import express from 'express';
import { body, validationResult } from 'express-validator';

import User from '../models/User.js';
import EnterpriseProject from '../models/EnterpriseProject.js';
import { sendEmail } from '../utils/sendEmail.js';
import { getIo } from '../socket/index.js';

const router = express.Router();

router.post(
  '/intake',
  [
    // Webhook auth (optional): if RFP_INTAKE_WEBHOOK_SECRET is set, clients must send the same value in header.
    body('clientReference').trim().notEmpty(),
    body('overallTotalBudget').isNumeric(),
    body('clientUser').optional().isMongoId(),

    // Support multiple key names from different email parsing services.
    body('originalRfpDocumentUrl').optional().isString(),
    body('rfpDocumentUrl').optional().isString(),
    body('originalRfpText').optional().isString(),
    body('rfpText').optional().isString(),
    // Attachments may include extracted document URLs (or file URLs) from your email parsing service.
    body('attachments').optional().isArray(),
    body('intakeMessageId').optional().isString(),
    body('messageId').optional().isString(),
  ],
  async (req, res) => {
    try {
      const secret = process.env.RFP_INTAKE_WEBHOOK_SECRET;
      if (secret) {
        const provided = req.headers['x-rfp-webhook-secret'] || req.headers['X-RFP-WEBHOOK-SECRET'];
        if (!provided || String(provided) !== String(secret)) {
          return res.status(401).json({ message: 'Unauthorized webhook' });
        }
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const clientReference = req.body.clientReference;
      const overallTotalBudget = Number(req.body.overallTotalBudget);
      const clientUser = req.body.clientUser || undefined;

      const originalRfpDocumentUrl = req.body.originalRfpDocumentUrl || req.body.rfpDocumentUrl;
      const originalRfpText = req.body.originalRfpText || req.body.rfpText;

      // If the parser only provides attachment URLs, map the first one into originalRfpDocumentUrl.
      const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
      const firstAttachmentUrl = attachments[0]?.url || attachments[0]?.documentUrl || attachments[0]?.link;
      const normalizedOriginalRfpDocumentUrl = originalRfpDocumentUrl || firstAttachmentUrl || undefined;

      if (!originalRfpText && !normalizedOriginalRfpDocumentUrl) {
        return res.status(400).json({ message: 'Provide at least one of originalRfpText/originalRfpDocumentUrl (or rfpText/rfpDocumentUrl).' });
      }

      const intakeMessageId = String(req.body.intakeMessageId || req.body.messageId || '').trim();
      if (intakeMessageId) {
        const existing = await EnterpriseProject.findOne({ intakeMessageId }).lean();
        if (existing) {
          return res.status(200).json({
            project: existing,
            duplicate: true,
            email: { sent: false, error: null },
          });
        }
      }

      const project = await EnterpriseProject.create({
        clientUser,
        clientReference,
        originalRfpDocumentUrl: normalizedOriginalRfpDocumentUrl || undefined,
        originalRfpText: originalRfpText || undefined,
        overallTotalBudget,
        microJobs: [],
        ...(intakeMessageId ? { intakeMessageId } : {}),
      });

      // Emit real-time dashboard update for admins
      try {
        const io = getIo();
        io.emit('enterprise_rfp_new', project);
      } catch (err) {
        console.error('Socket error during RFP intake:', err);
      }

      // Trigger internal email notification to admins.
      let emailSent = false;
      let emailError = null;

      const adminEmails = process.env.ADMIN_RFP_INTAKE_EMAIL_TO
        ? String(process.env.ADMIN_RFP_INTAKE_EMAIL_TO)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        : (await User.find({ role: 'admin', isActive: true }).select('email').lean())
          .map((u) => u.email)
          .filter(Boolean);

      if (adminEmails.length > 0) {
        const excerpt = originalRfpText ? originalRfpText.slice(0, 4000) : '';
        const text = [
          'New Enterprise RFP received',
          '',
          `Project ID: ${project._id}`,
          `Client Reference: ${clientReference}`,
          `Total Budget: ${overallTotalBudget}`,
          '',
          normalizedOriginalRfpDocumentUrl ? `RFP URL: ${normalizedOriginalRfpDocumentUrl}` : 'RFP URL: (not provided)',
          '',
          originalRfpText ? `RFP Text (excerpt):\n${excerpt}${originalRfpText.length > 4000 ? '\n...(truncated)' : ''}` : 'RFP Text: (not provided)',
          '',
        ].join('\n');

        const subject = `New Enterprise RFP: ${clientReference} (${project._id})`;

        try {
          await sendEmail({
            to: adminEmails.join(','),
            subject,
            text,
          });
          emailSent = true;
        } catch (err) {
          emailError = err?.message ? String(err.message) : 'Email send failed';
        }
      }

      return res.status(201).json({
        project,
        email: { sent: emailSent, error: emailError },
      });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }
);

export default router;

