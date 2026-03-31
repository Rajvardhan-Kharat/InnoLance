import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const config = {
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: process.env.IMAP_USER || 'erfindenrfpsystems@gmail.com',
    pass: process.env.IMAP_PASSWORD,
  },
  logger: false, // Set to true for debugging IMAP connection
};

process.on('uncaughtException', (err) => {
  console.error('\n[Listener Recovered] A network timeout or IMAP connection drop occurred:', err.message);
  console.error('The script will attempt to remain alive, but if you stop receiving emails, please restart it.\n');
});

if (!config.auth.pass || config.auth.pass === 'your_16_char_app_password') {
  console.error('ERROR: You must define a real IMAP_PASSWORD (Gmail App Password) in your .env file to run this listener.');
  process.exit(1);
}

const client = new ImapFlow(config);

client.on('error', err => {
  console.log('IMAP Connection Error (Network dropout):', err.message);
});

client.on('close', () => {
  console.log('IMAP Connection Closed. Restart the script if needed.');
});

async function startListener() {
  await client.connect();
  console.log(`Connected to IMAP as ${config.auth.user}`);
  
  // Select inbox and wait for IDLE mode
  let lock = await client.getMailboxLock('INBOX');
  console.log('Listening for incoming PRD emails...');
  
  try {
    // Process existing UNPREAD emails immediately
    await processUnreadEmails();

    // Listen for new messages arriving
    client.on('exists', async () => {
      console.log('New email detected! Processing...');
      await processUnreadEmails();
    });

  } catch (err) {
    console.error('Listener Error:', err);
  } finally {
    // The script is designed to run forever, so we generally don't release the lock unless shutting down
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
      
      // Unique reference
      const emailPrefix = senderObj.address.split('@')[0].toUpperCase();
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
      };

      try {
        console.log(`Posting extracted RFP payload to webhook...`);
        const res = await axios.post('http://localhost:5003/api/enterprise-rfp/intake', payload, {
          headers: {
            'Content-Type': 'application/json',
          }
        });
        console.log(`Success! Created EnterpriseProject ID: ${res.data.project._id}`);
        
        // Mark as seen so we don't process it again
        await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen']);
        console.log('Email marked as read.');
      } catch (postErr) {
        console.error('Failed to post webhook. Is the backend running on 5003?', postErr.message);
      }
      console.log(`======================================\n`);
    }
  } catch (err) {
    console.error('Error fetching emails:', err);
  }
}

startListener().catch((err) => {
  console.error('Failed to start listener:', err);
  process.exit(1);
});
