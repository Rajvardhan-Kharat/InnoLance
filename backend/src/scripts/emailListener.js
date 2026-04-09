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

const config = {
  host: process.env.IMAP_HOST || 'imap.gmail.com',
  port: Number(process.env.IMAP_PORT || 993),
  secure: String(process.env.IMAP_SECURE || 'true').toLowerCase() !== 'false',
  auth: {
    user: process.env.IMAP_USER || 'erfindenrfpsystems@gmail.com',
    pass: String(process.env.IMAP_PASSWORD || '').replace(/\s+/g, ''),
  },
  logger: false, // Set to true for debugging IMAP connection
};

process.on('uncaughtException', (err) => {
  const msg = String(err?.message || '');
  const isImapLike = msg.includes('NoConnection')
    || msg.toLowerCase().includes('imap')
    || msg.toLowerCase().includes('mailbox')
    || msg.toLowerCase().includes('timeout');
  if (isImapLike) {
    console.error('\n[Listener Recovered] IMAP/network issue:', msg);
    console.error('Listener will auto-reconnect.\n');
    return;
  }
  // Do not mask unrelated fatal errors (e.g. EADDRINUSE on API server).
  console.error('\n[Fatal] Uncaught exception outside IMAP listener:', msg);
  process.exit(1);
});

if (!config.auth.pass || config.auth.pass === 'your_16_char_app_password') {
  console.error('\n⚠️ WARNING: IMAP_PASSWORD is not set in .env. Email listener will NOT start. ⚠️\n');
}

const client = new ImapFlow(config);
let isConnected = false;
let connectInFlight = null;

async function ensureConnected() {
  if (client.usable && isConnected) return;
  if (connectInFlight) {
    await connectInFlight;
    return;
  }
  connectInFlight = (async () => {
    if (client.usable) {
      await client.mailboxOpen('INBOX');
      isConnected = true;
      return;
    }
    await client.connect();
    await client.mailboxOpen('INBOX');
    isConnected = true;
    console.log(`Connected to IMAP as ${config.auth.user}`);
  })();
  try {
    await connectInFlight;
  } finally {
    connectInFlight = null;
  }
}

client.on('error', err => {
  console.log('IMAP Connection Error (Network dropout):', err.message);
  isConnected = false;
});

client.on('close', () => {
  isConnected = false;
  console.log('IMAP Connection Closed. Will auto-reconnect on next poll.');
});

async function startListener() {
  await ensureConnected();
  console.log('Listening for incoming PRD emails...');

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
        console.warn('IMAP disconnected during processing. Reconnecting...');
        await ensureConnected();
        return;
      }
      throw err;
    } finally {
      processing = false;
    }
  };

  try {
    // Process existing unread emails immediately
    await runProcess();

    // Listen for new messages arriving
    client.on('exists', async () => {
      console.log('New email detected! Processing...');
      await runProcess();
    });

    // Poll fallback in case IMAP IDLE notifications are missed.
    setInterval(() => {
      runProcess().catch((err) => console.error('Poll processing error:', err.message));
    }, Number(process.env.IMAP_POLL_INTERVAL_MS || 30000));
  } catch (err) {
    console.error('Listener Error:', err);
  }
}

async function processUnreadEmails() {
  try {
    const list = await client.search({ seen: false });
    if (!list || list.length === 0) return;

    for await (let message of client.fetch(list, { source: true, uid: true })) {
      const parsed = await simpleParser(message.source);
      
      console.log(`\n======================================`);
      const senderObj = parsed.from && parsed.from.value && parsed.from.value[0] ? parsed.from.value[0] : { address: 'unknown@example.com', name: 'Unknown' };
      console.log(`Received PRD Email from: ${senderObj.address}`);
      console.log(`Subject: ${parsed.subject}`);
      
      // Simple extraction logic: pull out numbers for budget.
      const rawText = parsed.text || parsed.textAsHtml || '';
      
      // Look for a budget number (e.g. Budget \n\n 👉 ₹30,000 or $50,000)
      const budgetMatch = rawText.match(/(?:budget|price|cost)[\s\S]{0,50}?(?:₹|\$|€|£|Rs\.?)\s*([\d,]+)/i) 
          || rawText.match(/(?:budget|price|cost)[\s\S]{0,20}?([\d,]+)/i);
          
      const overallTotalBudget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, '')) : 10000;
      
      const emailPrefix = senderObj.address.split('@')[0].toUpperCase().replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'SENDER';
      const subjectStr = String(parsed.subject || '');
      const intakeMessageId = (parsed.messageId && String(parsed.messageId).trim())
        || `hash:${crypto.createHash('sha256').update(`${senderObj.address}|${subjectStr}|${rawText.slice(0, 2000)}`).digest('hex')}`;

      // Human-readable ref for new rows only (dedupe uses intakeMessageId on the server)
      const clientReference = `RFP-${emailPrefix}-${Date.now().toString().slice(-4)}`;

      // Try to extract an attachment URL if one was sent
      let attachmentUrl = null;
      if (parsed.attachments && parsed.attachments.length > 0) {
        // Because downloading to local is complex here, we'll just note the filename. In a real cloud env, you upload the buffer to S3 and pass the URL to payload.
        console.log(`Found ${parsed.attachments.length} attachments. Simulation will use a mock URL.`);
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
        console.log(`Posting extracted RFP payload to ${apiBase}/api/enterprise-rfp/intake ...`);
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
          console.log(`Duplicate email skipped (already have EnterpriseProject ${res.data.project._id}).`);
        } else {
          console.log(`Success! EnterpriseProject ID: ${res.data.project._id}`);
        }

        // Always mark read after successful intake/dedup so restarts do not reprocess.
        // Some IMAP servers can ignore add; fallback to explicit set and verify.
        try {
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
        } catch (flagAddErr) {
          console.warn(`FlagsAdd failed for uid=${message.uid}: ${flagAddErr.message}. Trying flagsSet fallback...`);
          await client.messageFlagsSet(message.uid, ['\\Seen'], { uid: true });
        }
        const verify = await client.fetchOne(message.uid, { flags: true }, { uid: true });
        const seen = Array.isArray(verify?.flags) && verify.flags.includes('\\Seen');
        if (!seen) {
          console.warn(`Warning: uid=${message.uid} still not marked as Seen after update.`);
        } else {
          console.log(`Email marked as read (uid=${message.uid}).`);
        }
      } catch (postErr) {
        console.error(
          `Failed processing uid=${message.uid} (${apiBase}). Keeping unread for retry.`,
          postErr.message
        );
      }
      console.log(`======================================\n`);
    }
  } catch (err) {
    console.error('Error fetching emails:', err);
  }
}

export { startListener };

// If run directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (config.auth.pass && config.auth.pass !== 'your_16_char_app_password') {
    startListener().catch((err) => {
      console.error('Failed to start listener:', err);
      process.exit(1);
    });
  }
}
