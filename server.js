require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { initDB, logMessage, getConversationHistory, getAllConversations, getAllMessages, getClientsNeedingPoke } = require('./database');
const { generateReply } = require('./ai');
const { sendMessage } = require('./wati');
const rag = require('./rag');

const app = express();
const PORT = process.env.PORT || 3000;

// Dashboard features
const excludedFile = './excluded_users.json';
let excludedNumbers = new Set();
// Load persistence
try { if (fs.existsSync(excludedFile)) excludedNumbers = new Set(JSON.parse(fs.readFileSync(excludedFile))); } catch (e) { }

const sseClients = []; // For real-time dashboard updates

// CONCURRENCY CONTROL - Per-user message queue to handle high load
const userLocks = new Map(); // { whatsappNumber: Promise }

// Legacy (unused but kept for reference)
const userCooldowns = new Map();
const processedMessageIds = new Set();
const COOLDOWN_MS = 60000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // WATI webhooks usually send JSON, but good to have

// Initialize DB on start
initDB();

// Health check
app.get('/', (req, res) => {
    res.send('WATI WhatsApp Bot is running');
});

// Webhook for Incoming Messages from WATI
app.post('/webhook', async (req, res) => {
    try {
        console.log('=== WEBHOOK RECEIVED ===');
        console.log('Body:', JSON.stringify(req.body, null, 2));

        const body = req.body || {};

        // ========== CRITICAL: DETECT BOT'S OWN MESSAGES ==========
        // WATI sends webhooks for OUTGOING messages too - we MUST ignore them

        // Trust exact boolean flags first
        if (body.isOwner === true || body.owner === true) {
            console.log('Ignored: isOwner/owner is true');
            return res.status(200).send('OK');
        }

        // Trigger on specific event types that are definitely outbound
        const eventType = (body.eventType || body.event || '').toLowerCase();
        const ignoreEventTypes = [
            'message_status', 'sent', 'delivered', 'read',
            'session_message_sent', 'template_message_sent',
            'message_delivered', 'message_read'
        ];

        if (ignoreEventTypes.includes(eventType)) {
            console.log('Ignored: outbound event type:', eventType);
            return res.status(200).send('OK');
        }

        // Fallback checks ONLY if we are unsure (owner is undefined or null)
        // If owner is explicitly false, we SKIP these checks and assume it's user
        if (body.isOwner !== false && body.owner !== false) {
            if (body.statusString === 'SENT' || body.status === 1 || body.sourceType === 0) {
                console.log('Ignored: inferred outbound (status/sourceType) and owner not false');
                return res.status(200).send('OK');
            }
        }

        // ========== EXTRACT MESSAGE DATA ==========
        const waId = body.waId || body.whatsappNumber || body.from || body.sender;
        const text = body.text || body.message || body.body;
        const messageType = body.type || body.messageType || 'text';
        const messageId = body.id || body.messageId || body.whatsappMessageId;

        console.log('Parsed - waId:', waId, 'text:', text, 'type:', messageType, 'msgId:', messageId);

        // ========== VALIDATE MESSAGE ==========
        if (!waId || !text) {
            console.log('Ignored: missing waId or text');
            return res.status(200).send('OK');
        }

        // Skip non-text messages
        if (messageType && messageType !== 'text') {
            console.log('Ignored: non-text message type:', messageType);
            return res.status(200).send('OK');
        }

        const whatsappNumber = waId.toString().replace(/[^0-9]/g, '');

        // ========== PERSISTENT MESSAGE DEDUPLICATION ==========
        const dedupKey = messageId || `${whatsappNumber}-${text.substring(0, 50)}`;
        const alreadyProcessed = await require('./database').isMessageProcessed(dedupKey);

        if (alreadyProcessed) {
            console.log('Ignored: duplicate message (DB):', dedupKey);
            return res.status(200).send('OK');
        }

        // ========== CONCURRENCY LOCK (PER USER) ==========
        // If a user sends multiple messages rapidly, process them sequentially
        while (userLocks.get(whatsappNumber)) {
            await userLocks.get(whatsappNumber);
        }

        const processingPromise = (async () => {
            try {
                // Double check dedup inside lock (prevent race conditions)
                if (await require('./database').isMessageProcessed(dedupKey)) return;

                console.log('>>> Processing message from:', whatsappNumber, '- Text:', text);

                // Check exclusion (Dashboad feature)
                if (excludedNumbers.has(whatsappNumber)) {
                    console.log('Ignored: number is excluded:', whatsappNumber);
                    return;
                }

                // 1. Log User Message
                await logMessage(whatsappNumber, 'user', text);

                // 2. Load History (Increased limit for better memory)
                const history = await getConversationHistory(whatsappNumber, 15);

                // 3. Generate AI Reply (now returns object with RAG info)
                const aiResult = await generateReply(text, history);
                const aiReply = typeof aiResult === 'object' ? aiResult.text : aiResult;
                console.log('>>> AI Reply for', whatsappNumber, ':', aiReply.substring(0, 50) + '...');
                if (aiResult.ragUsed) console.log('[RAG] Context used:', aiResult.ragChunks?.length, 'chunks');

                // 4. Log Assistant Reply
                await logMessage(whatsappNumber, 'assistant', aiReply);

                // 5. Send Reply via WATI
                await sendMessage(whatsappNumber, aiReply);

                // 6. Mark as processed in DB (survives restarts)
                await require('./database').markMessageProcessed(dedupKey);

                // 7. Auto-Learn Logic
                const successKeywords = ['paid', 'done', 'sent', 'confirmed', 'thank you', 'thanks'];
                if (successKeywords.some(kw => text.toLowerCase().includes(kw)) && history.length >= 2) {
                    const recentHistory = history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
                    const learningEntry = `\n\n---\n### Auto-Learned Pattern (${new Date().toISOString()})\nUser ${whatsappNumber}\n\`\`\`\n${recentHistory}\nuser: ${text}\nassistant: ${aiReply}\n\`\`\`\n`;
                    fs.appendFileSync('./knowledge_base.md', learningEntry);
                }

                // 8. Broadcast to Dashboard
                const liveData = JSON.stringify({ from: whatsappNumber, text, reply: aiReply });
                sseClients.forEach(client => {
                    try { client.res.write(`data: ${liveData}\n\n`); } catch (e) { }
                });

            } catch (err) {
                console.error('CRITICAL: Processing error for', whatsappNumber, ':', err.message);
            }
        })();

        userLocks.set(whatsappNumber, processingPromise);
        await processingPromise;
        userLocks.delete(whatsappNumber);

        res.status(200).send('OK');
    } catch (error) {
        console.error('Global Webhook Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ========== DASHBOARD ROUTES ==========

// Serve Dashboard HTML
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Get all conversations (for client list)
app.get('/api/conversations', async (req, res) => {
    try {
        const conversations = await getAllConversations();
        res.json({ conversations });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get messages for a specific user
app.get('/api/messages/:waId', async (req, res) => {
    try {
        const messages = await getConversationHistory(req.params.waId, 100);
        res.json({ messages });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Export ALL messages as CSV
app.get('/api/export-all', async (req, res) => {
    try {
        const messages = await getAllMessages();

        // Generate CSV
        let csv = 'Client,Date,Role,Message\n';
        messages.forEach(m => {
            const date = new Date(m.timestamp).toLocaleString();
            const content = (m.content || '').replace(/"/g, '""').replace(/\n/g, ' ');
            csv += `"${m.waId}","${date}","${m.role}","${content}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=all_chats_${new Date().toISOString().slice(0, 10)}.csv`);
        res.send(csv);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// manual reply
app.post('/api/send-message', async (req, res) => {
    try {
        const { waId, text } = req.body;
        if (!waId || !text) return res.status(400).json({ error: 'Missing waId or text' });

        await logMessage(waId, 'assistant', text);
        await sendMessage(waId, text);

        // Broadcast to dashboard
        const liveData = JSON.stringify({ from: waId, text: 'MANUAL REPLY: ' + text, reply: text });
        sseClients.forEach(client => { try { client.res.write(`data: ${liveData}\n\n`); } catch (e) { } });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Knowledge Base
app.get('/api/kb', (req, res) => {
    try {
        const content = fs.readFileSync('./knowledge_base.md', 'utf8');
        res.json({ content });
    } catch (e) {
        res.json({ content: '' });
    }
});

// Update Knowledge Base
app.post('/api/kb', (req, res) => {
    try {
        const { content } = req.body;
        fs.writeFileSync('./knowledge_base.md', content);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get excluded numbers
app.get('/api/excluded', (req, res) => {
    res.json({ excluded: Array.from(excludedNumbers) });
});

// Add to excluded
app.post('/api/excluded/:waId', (req, res) => {
    excludedNumbers.add(req.params.waId);
    fs.writeFileSync(excludedFile, JSON.stringify(Array.from(excludedNumbers)));
    res.json({ success: true });
});

// Remove from excluded
app.delete('/api/excluded/:waId', (req, res) => {
    excludedNumbers.delete(req.params.waId);
    fs.writeFileSync(excludedFile, JSON.stringify(Array.from(excludedNumbers)));
    res.json({ success: true });
});

// SSE endpoint for live updates
app.get('/api/live', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    sseClients.push({ id: clientId, res });

    req.on('close', () => {
        const index = sseClients.findIndex(c => c.id === clientId);
        if (index !== -1) sseClients.splice(index, 1);
    });
});

// Legacy endpoint (kept for compatibility)
app.post('/update-kb', (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).send('Content required');
    fs.writeFileSync('./knowledge_base.md', content);
    res.send('Knowledge base updated');
});

// ========== RAG STATUS ENDPOINT ==========
app.get('/api/rag-status', (req, res) => {
    const status = rag.getStatus();
    res.json(status);
});

// ========== TEST AI ENDPOINT (for local testing without WATI) ==========
app.post('/api/test-ai', async (req, res) => {
    try {
        const { query, waId = 'test-user', useHistory = false } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        console.log(`[TEST-AI] Query from ${waId}: ${query}`);

        // For testing, use empty history by default to get clean responses
        // Set useHistory=true in body to use actual history
        const history = useHistory ? await getConversationHistory(waId, 10) : [];

        // Generate AI reply (now returns object with RAG info)
        const startTime = Date.now();
        const aiResult = await generateReply(query, history);
        const duration = Date.now() - startTime;

        // Handle both old string format and new object format
        const aiReply = typeof aiResult === 'object' ? aiResult.text : aiResult;
        const ragUsed = typeof aiResult === 'object' ? aiResult.ragUsed : false;
        const ragChunks = typeof aiResult === 'object' ? aiResult.ragChunks : [];

        console.log(`[TEST-AI] Reply (${duration}ms): ${aiReply.substring(0, 100)}...`);
        if (ragUsed) console.log(`[TEST-AI] RAG context used: ${ragChunks.length} chunks`);

        // Don't log test messages to avoid polluting conversation history
        // Real webhook messages will still be logged

        // Broadcast to dashboard (for live feed)
        const liveData = JSON.stringify({ from: waId, text: query, reply: aiReply });
        sseClients.forEach(client => {
            try { client.res.write(`data: ${liveData}\n\n`); } catch (e) { }
        });

        res.json({
            success: true,
            query,
            reply: aiReply,
            duration: `${duration}ms`,
            model: process.env.OPENROUTER_MODEL || 'google/gemini-pro',
            ragUsed,
            ragChunks
        });
    } catch (error) {
        console.error('[TEST-AI] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== WATI CHAT SYNC ==========
const axios = require('axios');

app.post('/api/sync-wati', async (req, res) => {
    const { startDate, endDate } = req.body;
    const start = startDate ? new Date(startDate) : new Date('2020-01-01');
    const end = endDate ? new Date(endDate) : new Date();

    if (!process.env.WATI_TOKEN || !process.env.WATI_API_URL) {
        console.error('WATI credentials missing from .env');
        return res.status(500).json({ error: 'Server configuration error: WATI credentials missing' });
    }

    console.log(`Starting WATI sync from ${start.toISOString()} to ${end.toISOString()}`);

    const headers = {
        'Authorization': `Bearer ${process.env.WATI_TOKEN}`,
        'Content-Type': 'application/json'
    };

    try {
        // Fetch contacts
        const contactsRes = await axios.get(
            `${process.env.WATI_API_URL}/api/v1/getContacts?pageSize=100&pageNumber=1`,
            { headers }
        );

        const contacts = contactsRes.data.contact_list || contactsRes.data.contacts || contactsRes.data || [];
        console.log(`Found ${contacts.length} contacts`);

        let totalMessages = 0;
        const allChats = [];

        for (const contact of contacts) {
            const waId = contact.wAid || contact.waId || contact.whatsappNumber || contact.phone;
            if (!waId) continue;

            try {
                const msgRes = await axios.get(
                    `${process.env.WATI_API_URL}/api/v1/getMessages/${waId}?pageSize=100&pageNumber=1`,
                    { headers }
                );

                const messages = (msgRes.data.messages || msgRes.data || []).filter(m => {
                    const msgDate = new Date(m.created || m.timestamp || m.time * 1000);
                    return msgDate >= start && msgDate <= end;
                });

                if (messages.length > 0) {
                    // Save messages to our database
                    for (const m of messages) {
                        const role = (m.owner || m.isOwner) ? 'assistant' : 'user';
                        const text = m.text || m.message || m.body || '';
                        if (text) {
                            await logMessage(waId, role, text);
                        }
                    }
                    totalMessages += messages.length;
                    allChats.push({ waId, count: messages.length });
                }
            } catch (e) {
                // Skip contacts with no messages
            }
        }

        console.log(`Sync complete: ${totalMessages} messages from ${allChats.length} contacts`);
        res.json({
            success: true,
            contacts: allChats.length,
            messages: totalMessages,
            details: allChats
        });

    } catch (error) {
        console.error('WATI sync error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get sync status / last sync
app.get('/api/sync-status', (req, res) => {
    const syncFile = './last_sync.json';
    try {
        const data = fs.existsSync(syncFile) ? JSON.parse(fs.readFileSync(syncFile, 'utf8')) : null;
        res.json(data || { lastSync: null });
    } catch (e) {
        res.json({ lastSync: null });
    }
});

// ========== AUTO-POKE KEEP-ALIVE SYSTEM ==========
// Runs periodically to poke clients before WATI 24h window expires

async function generatePokeMessage(waId, history) {
    // Build context from past conversation
    const contextSummary = history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');

    const pokePrompts = [
        `Based on our previous chat, I have a special offer just for you Sir. Are you still interested in automating your trading?`,
        `Hello Sir, I wanted to follow up. We have a limited time discount available today. Shall I share the details?`,
        `Sir, are you still looking for a reliable EA? I can offer you our best package at a reduced price today only.`,
        `Just checking in Sir. Many traders started with us this week. Would you like to join them?`,
        `Hello again Sir, I noticed you were interested earlier. I can give you an exclusive deal if you decide today.`
    ];

    // Pick a random poke message
    const baseMessage = pokePrompts[Math.floor(Math.random() * pokePrompts.length)];

    // Use AI to personalize if we have context
    if (history.length > 0) {
        try {
            const aiPoke = await generateReply('Generate a SHORT (1-2 sentences max) friendly follow-up message to re-engage this customer. Be helpful, offer a deal. Do NOT say hello again if you already did. Context of past chat:\n' + contextSummary, []);
            if (aiPoke && aiPoke.length > 10 && aiPoke.length < 300) {
                return aiPoke;
            }
        } catch (e) {
            console.error('AI poke generation failed, using fallback:', e.message);
        }
    }

    return baseMessage;
}

async function runAutoPoke() {
    console.log('[AUTO-POKE] Running keep-alive check...');

    try {
        const clientsNeedingPoke = await getClientsNeedingPoke();
        console.log(`[AUTO-POKE] Found ${clientsNeedingPoke.length} clients needing follow-up`);

        for (const client of clientsNeedingPoke) {
            // Skip excluded numbers
            if (excludedNumbers.has(client.waId)) {
                console.log(`[AUTO-POKE] Skipping excluded: ${client.waId}`);
                continue;
            }

            try {
                // Get conversation history for context
                const history = await getConversationHistory(client.waId, 10);

                // Generate personalized poke message
                const pokeMessage = await generatePokeMessage(client.waId, history);

                console.log(`[AUTO-POKE] Sending to ${client.waId}: ${pokeMessage.substring(0, 50)}...`);

                // Log the message
                await logMessage(client.waId, 'assistant', pokeMessage);

                // Send via WATI
                await sendMessage(client.waId, pokeMessage);

                // Broadcast to dashboard
                const liveData = JSON.stringify({ from: client.waId, text: '[AUTO-POKE]', reply: pokeMessage });
                sseClients.forEach(c => { try { c.res.write(`data: ${liveData}\n\n`); } catch (e) { } });

                // Small delay between messages to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (err) {
                console.error(`[AUTO-POKE] Error poking ${client.waId}:`, err.message);
            }
        }

        console.log('[AUTO-POKE] Keep-alive check complete');
    } catch (err) {
        console.error('[AUTO-POKE] Scheduler error:', err.message);
    }
}

// Run auto-poke every hour (will catch clients who are 11+ hours idle)
const AUTO_POKE_INTERVAL = 60 * 60 * 1000; // 1 hour
setInterval(runAutoPoke, AUTO_POKE_INTERVAL);

// Also run once shortly after server starts
setTimeout(runAutoPoke, 30000); // 30 seconds after boot

// Manual trigger endpoint for testing
app.post('/api/trigger-poke', async (req, res) => {
    console.log('[AUTO-POKE] Manual trigger received');
    await runAutoPoke();
    res.json({ success: true, message: 'Auto-poke executed' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard available at http://localhost:${PORT}/dashboard`);
    console.log(`Auto-Poke scheduler running every ${AUTO_POKE_INTERVAL / 60000} minutes`);
});
