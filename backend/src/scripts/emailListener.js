import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// ─── IMAP Config ──────────────────────────────────────────────────────────────
const config = {
  host: process.env.IMAP_HOST || 'imap.gmail.com',
  port: Number(process.env.IMAP_PORT || 993),
  secure: String(process.env.IMAP_SECURE || 'true').toLowerCase() !== 'false',
  auth: {
    user: process.env.IMAP_USER || 'erfindenrfpsystems@gmail.com',
    pass: String(process.env.IMAP_PASSWORD || '').replace(/\s+/g, ''),
  },
  logger: false,
};

// ─── RFP/PRD Intelligence Filter ─────────────────────────────────────────────
/**
 * Returns true if the email content looks like an RFP, PRD, or project brief.
 * Skips newsletters, OTPs, notifications, automated alerts, marketing emails, etc.
 */
function isRfpOrPrdEmail({ subject, text, from }) {
  const subj = String(subject || '').toLowerCase();
  const body  = String(text || '').toLowerCase().slice(0, 5000);
  const sender = String(from?.address || '').toLowerCase();

  // ── Hard SKIP: known non-RFP patterns ────────────────────────────────────
  const skipSubjectPatterns = [
    /otp|one.time.password|verification code|verify your/i,
    /unsubscribe|newsletter|weekly digest|daily digest/i,
    /noreply|no-reply|donotreply|do-not-reply/i,
    /notification|alert|reminder|follow.?up|invoice|receipt/i,
    /password reset|account recovery|sign.?in|login/i,
    /welcome to|thanks for signing|subscription confirmed/i,
    /your order|order confirmation|shipping|delivery/i,
    /payment received|payment failed|transaction/i,
    /job alert|new job|hiring now|we.re hiring/i,
  ];
  for (const pat of skipSubjectPatterns) {
    if (pat.test(subj)) return false;
  }

  // ── Hard SKIP: automated/noreply sender domains ───────────────────────────
  const skipSenderPatterns = [
    /noreply@|no-reply@|donotreply@|notifications@|alerts@|mailer@|newsletter@/i,
    /@linkedin\.com|@twitter\.com|@facebook\.com|@instagram\.com/i,
    /@github\.com|@gitlab\.com|@jira|@atlassian/i,
    /\+caf_=|bounce\+|sendgrid|mailchimp|mailgun|amazonaws\.com\/ses/i,
  ];
  for (const pat of skipSenderPatterns) {
    if (pat.test(sender)) return false;
  }

  // ── Content too short to be a real brief ────────────────────────────────--
  if (body.trim().length < 80) return false;

  // ── POSITIVE: subject-level RFP/PRD signals ──────────────────────────────
  const rfpSubjectPatterns = [
    /rfp|request for proposal|request for quotation|rfq/i,
    /prd|product requirement|project requirement|project brief/i,
    /project proposal|project enquiry|project inquiry/i,
    /scope of work|sow|statement of work/i,
    /looking for (a |an )?(developer|freelancer|team|agency|vendor)/i,
    /need (to build|a website|an app|a system|a platform|software)/i,
    /hiring|project opportunity|work opportunity/i,
  ];
  for (const pat of rfpSubjectPatterns) {
    if (pat.test(subj)) return true;
  }

  // ── POSITIVE: body-level RFP/PRD signals (score-based) ───────────────────
  const rfpBodySignals = [
    { pattern: /\b(rfp|request for proposal|request for quotation)\b/i, score: 10 },
    { pattern: /\b(prd|product requirements? document)\b/i, score: 10 },
    { pattern: /\b(scope of work|statement of work|deliverables)\b/i, score: 8 },
    { pattern: /\b(budget|project cost|estimated cost|total cost)\b/i, score: 5 },
    { pattern: /\b(deadline|timeline|milestones?|go.?live)\b/i, score: 4 },
    { pattern: /\b(requirements?|specifications?|functional requirements?)\b/i, score: 5 },
    { pattern: /\b(tech stack|technology stack|preferred tech|backend|frontend|api)\b/i, score: 4 },
    { pattern: /\b(mobile app|web app|platform|e-?commerce|erp|crm|dashboard)\b/i, score: 4 },
    { pattern: /\b(proposal|bid|quotation|quote)\b/i, score: 5 },
    { pattern: /\b(user stor(y|ies)|epics?|sprint|agile|mvp)\b/i, score: 6 },
    { pattern: /\b(looking for|searching for|need|require|want to build|want to develop)\b/i, score: 3 },
    { pattern: /\b(freelancer|developer|agency|vendor|contractor)\b/i, score: 3 },
    { pattern: /\b(project|build|develop|design|create|launch)\b/i, score: 2 },
  ];

  let score = 0;
  for (const { pattern, score: pts } of rfpBodySignals) {
    if (pattern.test(body)) score += pts;
    if (score >= 15) return true; // Early exit once confident
  }

  return score >= 12; // Threshold for classification as RFP/PRD
}

// ─── Error handling ───────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  const msg = String(err?.message || '');
  const isImapLike = msg.includes('NoConnection')
    || msg.toLowerCase().includes('imap')
    || msg.toLowerCase().includes('mailbox')
    || msg.toLowerCase().includes('timeout');
  if (isImapLike) {
    console.error('\n[Listener Recovered] IMAP/network issue:', msg);
    return;
  }
  console.error('\n[Fatal] Uncaught exception outside IMAP listener:', msg);
  process.exit(1);
});

if (!config.auth.pass || config.auth.pass === 'your_16_char_app_password') {
  console.error('\n⚠️  WARNING: IMAP_PASSWORD is not set in .env. Email listener will NOT start. ⚠️\n');
}

// ─── IMAP Client ──────────────────────────────────────────────────────────────
const client = new ImapFlow(config);
let isConnected = false;
let connectInFlight = null;

async function ensureConnected() {
  if (client.usable && isConnected) return;
  if (connectInFlight) { await connectInFlight; return; }
  connectInFlight = (async () => {
    if (client.usable) {
      await client.mailboxOpen('INBOX');
      isConnected = true;
      return;
    }
    await client.connect();
    await client.mailboxOpen('INBOX');
    isConnected = true;
    console.log(`[IMAP] Connected as ${config.auth.user}`);
  })();
  try {
    await connectInFlight;
  } finally {
    connectInFlight = null;
  }
}

client.on('error', (err) => {
  console.log('[IMAP] Connection error:', err.message);
  isConnected = false;
});

client.on('close', () => {
  isConnected = false;
  console.log('[IMAP] Connection closed. Will auto-reconnect on next poll.');
});

// ─── Core email processor ─────────────────────────────────────────────────────
async function processUnreadEmails() {
  try {
    const list = await client.search({ seen: false });
    if (!list || list.length === 0) return;

    let processed = 0, skipped = 0;

    for await (let message of client.fetch(list, { source: true, uid: true })) {
      const parsed = await simpleParser(message.source);

      const senderObj = parsed.from?.value?.[0] || { address: 'unknown@example.com', name: 'Unknown' };
      const rawText   = parsed.text || parsed.textAsHtml || '';
      const subject   = String(parsed.subject || '');

      console.log(`\n${'─'.repeat(50)}`);
      console.log(`[IMAP] From: ${senderObj.address}`);
      console.log(`[IMAP] Subject: ${subject}`);

      // ── RFP/PRD Intelligence Filter ───────────────────────────────────────
      const looksLikeRfp = isRfpOrPrdEmail({
        subject,
        text: rawText,
        from: senderObj,
      });

      if (!looksLikeRfp) {
        console.log(`[IMAP] 🔕 SKIPPED — Email does not appear to be an RFP/PRD/Project Brief.`);
        // Mark as read so we don't keep re-evaluating it
        try {
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
        } catch (_) { /* ignore flag errors on skipped */ }
        skipped++;
        console.log(`${'─'.repeat(50)}\n`);
        continue;
      }

      console.log(`[IMAP] ✅ Identified as RFP/PRD. Processing...`);

      // ── Budget extraction ─────────────────────────────────────────────────
      const budgetMatch = rawText.match(/(?:budget|price|cost)[\s\S]{0,50}?(?:₹|\$|€|£|Rs\.?)\s*([\d,]+)/i)
        || rawText.match(/(?:budget|price|cost)[\s\S]{0,20}?([\d,]+)/i);
      const overallTotalBudget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, '')) : 10000;

      // ── Dedup ID ──────────────────────────────────────────────────────────
      const emailPrefix  = senderObj.address.split('@')[0].toUpperCase().replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'SENDER';
      const subjectStr   = String(parsed.subject || '');
      const intakeMessageId = (parsed.messageId && String(parsed.messageId).trim())
        || `hash:${crypto.createHash('sha256').update(`${senderObj.address}|${subjectStr}|${rawText.slice(0, 2000)}`).digest('hex')}`;

      const clientReference = `RFP-${emailPrefix}-${Date.now().toString().slice(-4)}`;

      // ── Attachment (mock URL in dev; real upload in cloud) ────────────────
      let attachmentUrl = null;
      if (parsed.attachments?.length > 0) {
        console.log(`[IMAP] Found ${parsed.attachments.length} attachment(s).`);
        attachmentUrl = `https://platform.com/uploads/${parsed.attachments[0].filename}`;
      }

      const payload = {
        clientReference,
        overallTotalBudget,
        originalRfpText: rawText,
        originalRfpDocumentUrl: attachmentUrl || undefined,
        intakeMessageId,
      };

      const apiBase = (process.env.RFP_INTAKE_BASE_URL || process.env.BACKEND_URL || `http://127.0.0.1:${process.env.PORT || 5000}`).replace(/\/$/, '');

      try {
        console.log(`[IMAP] Posting to ${apiBase}/api/enterprise-rfp/intake ...`);
        const res = await axios.post(`${apiBase}/api/enterprise-rfp/intake`, payload, {
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.RFP_INTAKE_WEBHOOK_SECRET
              ? { 'x-rfp-webhook-secret': process.env.RFP_INTAKE_WEBHOOK_SECRET }
              : {}),
          },
          validateStatus: (s) => s >= 200 && s < 300,
        });

        if (res.data?.duplicate) {
          console.log(`[IMAP] Duplicate — already have EnterpriseProject ${res.data.project._id}.`);
        } else {
          console.log(`[IMAP] 🎉 Created EnterpriseProject ID: ${res.data.project._id}`);
        }

        // Mark as read
        try {
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
        } catch (flagAddErr) {
          console.warn(`[IMAP] FlagsAdd failed (uid=${message.uid}): ${flagAddErr.message}. Trying flagsSet...`);
          await client.messageFlagsSet(message.uid, ['\\Seen'], { uid: true });
        }

        const verify = await client.fetchOne(message.uid, { flags: true }, { uid: true });
        const seen   = Array.isArray(verify?.flags) && verify.flags.includes('\\Seen');
        console.log(`[IMAP] Marked as ${seen ? 'read ✓' : 'UNREAD ⚠️  (flag set failed)'} (uid=${message.uid})`);
        processed++;
      } catch (postErr) {
        console.error(`[IMAP] ❌ Failed to post uid=${message.uid}:`, postErr.message);
      }

      console.log(`${'─'.repeat(50)}\n`);
    }

    if (processed > 0 || skipped > 0) {
      console.log(`[IMAP] Batch done — ${processed} RFP(s) ingested, ${skipped} non-RFP(s) skipped.`);
    }
  } catch (err) {
    console.error('[IMAP] Error fetching emails:', err);
  }
}

// ─── Listener bootstrap ───────────────────────────────────────────────────────
async function startListener() {
  await ensureConnected();
  console.log('[IMAP] Listening for incoming PRD/RFP emails...');

  let processing = false;
  const runProcess = async () => {
    if (processing) return;
    processing = true;
    try {
      await ensureConnected();
      await processUnreadEmails();
    } catch (err) {
      if (err?.code === 'NoConnection') {
        isConnected = false;
        console.warn('[IMAP] Disconnected during processing. Reconnecting...');
        await ensureConnected();
        return;
      }
      throw err;
    } finally {
      processing = false;
    }
  };

  // Process existing unread immediately
  await runProcess();

  // Real-time new message handler
  client.on('exists', async () => {
    console.log('[IMAP] New email detected! Evaluating...');
    await runProcess();
  });

  // Poll fallback every 30s (in case IMAP IDLE notifications are missed)
  setInterval(() => {
    runProcess().catch((err) => console.error('[IMAP] Poll error:', err.message));
  }, Number(process.env.IMAP_POLL_INTERVAL_MS || 30000));
}

export { startListener };

// Run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (config.auth.pass && config.auth.pass !== 'your_16_char_app_password') {
    startListener().catch((err) => {
      console.error('[IMAP] Failed to start listener:', err);
      process.exit(1);
    });
  }
}
