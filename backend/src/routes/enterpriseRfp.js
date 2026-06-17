import express from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import User from '../models/User.js';
import EnterpriseProject from '../models/EnterpriseProject.js';
import { sendEmail } from '../utils/sendEmail.js';
import { getIo } from '../socket/index.js';
import { generatePrdFromIdea, generateRfpFromIdea } from '../services/aiPrdGenerator.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// ─── Multer setup for RFP document uploads ───────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rfpUploadDir = path.join(__dirname, '..', '..', 'uploads', 'rfp-docs');
if (!fs.existsSync(rfpUploadDir)) fs.mkdirSync(rfpUploadDir, { recursive: true });

const rfpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, rfpUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `rfp-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const allowedMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
];

const rfpUpload = multer({
  storage: rfpStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOCX, DOC, TXT, PNG, JPEG files are allowed'));
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Webhook intake (email parser → platform)
router.post(
  '/intake',
  [
    body('clientReference').trim().notEmpty(),
    body('overallTotalBudget').isNumeric(),
    body('clientUser').optional().isMongoId(),
    body('originalRfpDocumentUrl').optional().isString(),
    body('rfpDocumentUrl').optional().isString(),
    body('originalRfpText').optional().isString(),
    body('rfpText').optional().isString(),
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

      const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
      const firstAttachmentUrl = attachments[0]?.url || attachments[0]?.documentUrl || attachments[0]?.link;
      const normalizedOriginalRfpDocumentUrl = originalRfpDocumentUrl || firstAttachmentUrl || undefined;

      if (!originalRfpText && !normalizedOriginalRfpDocumentUrl) {
        return res.status(400).json({ message: 'Provide at least one of originalRfpText/originalRfpDocumentUrl.' });
      }

      const intakeMessageId = String(req.body.intakeMessageId || req.body.messageId || '').trim();
      if (intakeMessageId) {
        const existing = await EnterpriseProject.findOne({ intakeMessageId }).lean();
        if (existing) {
          return res.status(200).json({ project: existing, duplicate: true, email: { sent: false, error: null } });
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

      try {
        const io = getIo();
        io.emit('enterprise_rfp_new', project);
      } catch (err) {
        console.error('Socket error during RFP intake:', err);
      }

      let emailSent = false;
      let emailError = null;

      const adminEmails = process.env.ADMIN_RFP_INTAKE_EMAIL_TO
        ? String(process.env.ADMIN_RFP_INTAKE_EMAIL_TO).split(',').map((s) => s.trim()).filter(Boolean)
        : (await User.find({ role: 'admin', isActive: true }).select('email').lean()).map((u) => u.email).filter(Boolean);

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

        try {
          await sendEmail({ to: adminEmails.join(','), subject: `New Enterprise RFP: ${clientReference} (${project._id})`, text });
          emailSent = true;
        } catch (err) {
          emailError = err?.message ? String(err.message) : 'Email send failed';
        }
      }

      return res.status(201).json({ project, email: { sent: emailSent, error: emailError } });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }
);

// ─── Direct structured submission from client RFP form ───────────────────────
router.post(
  '/direct-submit',
  protect,
  restrictTo('client', 'freelancer', 'admin'),
  rfpUpload.single('rfpDocument'),
  [
    body('projectOverview').trim().notEmpty().withMessage('Project Overview is required'),
    body('technicalScope').optional().isString(),
    body('goalsAndRequirements').optional().isString(),
    body('startDate').optional().isISO8601(),
    body('finalDeadline').optional().isISO8601(),
    body('budgetRange').optional().isString(),
    body('companyName').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        projectOverview,
        technicalScope = '',
        goalsAndRequirements = '',
        startDate,
        finalDeadline,
        budgetRange = '',
        companyName = '',
      } = req.body;

      // Compose full RFP text from structured fields
      const rfpSections = [
        `## Project Overview / Problem Statement\n${projectOverview}`,
        technicalScope ? `## Technical Scope & Requirements\n${technicalScope}` : '',
        goalsAndRequirements ? `## Goals & Requirements\n${goalsAndRequirements}` : '',
        startDate || finalDeadline ? `## Timeline\nStart Date: ${startDate || 'TBD'}\nFinal Deadline: ${finalDeadline || 'TBD'}` : '',
        budgetRange ? `## Budget Range\n${budgetRange}` : '',
      ].filter(Boolean).join('\n\n');

      const clientReference = companyName
        ? `${companyName}-${req.user._id}-${Date.now()}`
        : `CLIENT-${req.user._id}-${Date.now()}`;

      // Handle uploaded file URL
      let uploadedDocUrl;
      if (req.file) {
        uploadedDocUrl = `/uploads/rfp-docs/${req.file.filename}`;
      }

      // Parse budget as number for the model
      const budgetNumbers = budgetRange.match(/[\d,]+/g);
      const parsedBudget = budgetNumbers && budgetNumbers.length > 0
        ? Number(budgetNumbers[budgetNumbers.length - 1].replace(/,/g, ''))
        : 0;

      const project = await EnterpriseProject.create({
        clientUser: req.user._id,
        clientReference,
        originalRfpText: rfpSections,
        originalRfpDocumentUrl: uploadedDocUrl,
        overallTotalBudget: parsedBudget,
        status: 'Pending Breakdown',
        microJobs: [],
        submissionType: 'direct',
        budgetRange,
        startDate: startDate ? new Date(startDate) : undefined,
        finalDeadline: finalDeadline ? new Date(finalDeadline) : undefined,
      });

      try {
        const io = getIo();
        io.emit('enterprise_rfp_new', project);
      } catch (err) {
        console.error('Socket error during direct RFP submit:', err);
      }

      // Notify admins via email
      try {
        const adminEmails = process.env.ADMIN_RFP_INTAKE_EMAIL_TO
          ? String(process.env.ADMIN_RFP_INTAKE_EMAIL_TO).split(',').map((s) => s.trim()).filter(Boolean)
          : (await User.find({ role: 'admin', isActive: true }).select('email').lean()).map((u) => u.email).filter(Boolean);

        if (adminEmails.length > 0) {
          await sendEmail({
            to: adminEmails.join(','),
            subject: `New Enterprise RFP Submitted: ${clientReference}`,
            text: `A new Enterprise RFP has been submitted by a client.\n\nProject ID: ${project._id}\nClient: ${req.user.firstName} ${req.user.lastName}\nReference: ${clientReference}\nBudget Range: ${budgetRange}\n\nRFP Text:\n${rfpSections.slice(0, 3000)}`,
          });
        }
      } catch (_) { /* email is non-critical */ }

      return res.status(201).json({
        message: 'Enterprise RFP submitted successfully. Our team will review and get back to you.',
        project,
      });
    } catch (err) {
      console.error('Error in direct RFP submit:', err);
      return res.status(500).json({ message: err.message });
    }
  }
);

// ─── AI: Generate draft RFP from idea text ───────────────────────────────────
router.post(
  '/generate-rfp-draft',
  protect,
  restrictTo('client', 'freelancer', 'admin'),
  [
    body('ideaText').isString().trim().notEmpty().withMessage('Idea text is required'),
    body('aiInstructions').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { ideaText, aiInstructions } = req.body;
      // generateRfpFromIdea never throws — it always returns a structured object
      const rfpDraft = await generateRfpFromIdea(ideaText, aiInstructions);

      return res.json(rfpDraft);
    } catch (err) {
      // Ultimate safety net: build a local fallback inline so we NEVER return 500
      console.error('[generate-rfp-draft] Unexpected error (local fallback used):', err.message);
      const { ideaText = '', aiInstructions = '' } = req.body || {};
      const idea = String(ideaText).trim();
      const lines = idea.split(/[.\n]+/).map((l) => l.trim()).filter(Boolean);
      return res.json({
        projectOverview: `We are looking to build a solution based on the following requirements:\n\n${idea.slice(0, 800)}\n\nWe expect a professional, scalable, and well-documented delivery.`,
        technicalScope: `Core functionality required:\n${lines.slice(0, 6).map((l) => `• ${l}`).join('\n')}\n\n• Responsive web/mobile interface\n• Secure authentication\n• Admin dashboard\n• REST API backend\n• Cloud-ready deployment`,
        goalsAndRequirements: `Functional Requirements:\n${lines.slice(0, 6).map((l) => `• ${l}`).join('\n')}\n\nNon-Functional Requirements:\n• 99.5% uptime SLA\n• Page load < 2 seconds\n• HTTPS and data encryption\n• Role-based access control\n• Post-launch 30-day support`,
        suggestedBudgetRange: '₹1,00,000 – ₹5,00,000',
        suggestedTimeline: 'Phase 1 (MVP): 2–3 months | Phase 2 (Full Launch): 4–6 months',
        _fallback: true,
      });
    }
  }
);

// ─── Existing idea submission route (kept for backward compat) ────────────────
router.post(
  '/submit-idea',
  [
    body('clientUser').isMongoId().withMessage('User ID is required'),
    body('ideaText').isString().trim().notEmpty().withMessage('Idea text is required'),
    body('overallTotalBudget').optional().isNumeric(),
    body('isEnterprise').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { clientUser, ideaText, overallTotalBudget = 0, isEnterprise = true } = req.body;

      const generatedPrd = await generatePrdFromIdea(ideaText);
      const clientReference = `USER-${clientUser}-IDEA-${Date.now()}`;

      let project;

      if (isEnterprise) {
        project = await EnterpriseProject.create({
          clientUser,
          clientReference,
          originalRfpText: generatedPrd,
          overallTotalBudget
        });

        try {
          const io = getIo();
          io.emit('enterprise_rfp_new', project);
        } catch (err) {
          console.error('Socket error during idea intake:', err);
        }
      }

      return res.status(201).json({
        message: 'Idea successfully converted to PRD and submitted',
        project,
        generatedPrd
      });
    } catch (err) {
      console.error('Error submitting idea:', err);
      return res.status(500).json({ message: err.message });
    }
  }
);

export default router;
