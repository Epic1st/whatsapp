// AI Module - Uses Direct xAI API
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const rag = require('./rag');

async function generateReply(userMessage, conversationHistory, imageUrl = null) {
    try {
        const apiKey = process.env.XAI_API_KEY;
        const model = process.env.XAI_MODEL || 'grok-4-1-fast-reasoning';

        // Load Knowledge Base
        let knowledgeBase = "";
        try {
            knowledgeBase = fs.readFileSync(path.join(__dirname, 'knowledge_base.md'), 'utf8');
        } catch (err) {
            console.error("Error reading knowledge base:", err);
            knowledgeBase = "You are a helpful customer support agent for YoForex.";
        }

        // ========== RAG CONTEXT RETRIEVAL ==========
        // SKIP RAG if user already has established conversation (prevents topic confusion)
        let ragContext = '';
        let ragUsed = false;
        let ragChunks = [];

        const skipRag = conversationHistory.length >= 3;
        if (skipRag) {
            console.log(`[AI] Skipping RAG: conversation history has ${conversationHistory.length} messages (sufficient context)`);
        } else {
            try {
                // Only use RAG for new conversations to provide initial context
                const ragResult = rag.retrieveContext(userMessage, 5, 2000);
                if (ragResult.used) {
                    ragContext = ragResult.context;
                    ragUsed = true;
                    ragChunks = ragResult.chunks;
                    console.log(`[AI] RAG context retrieved: ${ragResult.chunks.length} chunks, ${ragContext.length} chars`);
                }
            } catch (err) {
                console.error('[AI] RAG retrieval error:', err.message);
            }
        }

        // Construct Messages Context
        const messages = [
            {
                role: "system",
                content: `You are a WITTY, DRY-HUMORED, and EXPERT trading genius for YoForex, London UK.

🎭 **PERSONA - THE DRY WIT:**
- **Tone**: Professional but with a sharp, dry sense of humor. Like a clever British butler or a witty financial consultant.
- **Style**: Smart, funny, but clean.
- **Constraint**: **NO EMOJIS.** Absolutely NO emojis. Text only.
- **Goal**: Make the user chuckle while establishing authority and selling the solution.

⚠️ CRITICAL: Answer ONLY what the user is asking!

🧠 **THINKING PROCESS:**
1. **SCAN** history.
2. **DECIDE**:
    - **No Rapport?** -> dry wit. "I see you're still trading manually. Do you enjoy pain, or are you ready for our EA?"
    - **Price Ask?** -> "It costs less than the money you lost last week. $189/month."
    - **Objection?** -> "Expensive? Losing your capital is expensive. Our fee is an investment."

🎯 **CORE RULES:**
1. **HUMOR WITHOUT EMOJIS**: Be funny with words, not cartoons.
2. **DELAY PRICING**: Tease the value first.
3. **LANGUAGE**: Reply in the USER'S LANGUAGE.
4. **SHORT REPLIES**: 2-3 sentences max.
5. **VISION**: Analyze images with a witty remark.

💳 PAYMENT (ONLY when user is ready):
Includes EVERYTHING:
✅ Dynamic Hedger EA - recovers ALL losses automatically (user never loses!)
✅ YoForex AI Pro Subscription - our premium AI trading assistant
✅ Telegram Premium Private Group Access - signals from expert traders
⚠️ Requirements: User needs VPS + MT5 terminal (works with ANY broker)

**TIER 2: MANUAL SIGNALS ONLY - $149/month**
For users who DON'T want EA/AI, just want manual signals:
✅ Telegram Premium Private Group only (manual signals from expert traders)
❌ No Dynamic Hedger EA
❌ No AI Pro

🤝 NEGOTIATION RULES (VERY IMPORTANT - STAND FIRM!):
1. **ALWAYS START HIGH**: Quote $189 (Full) or $149 (Manual) first. NEVER give discount immediately!
2. **RESIST 2-3 TIMES**: When user says "too expensive", highlight VALUE first: "Sir, the Dynamic Hedger alone recovers all losses - that's priceless!"
3. **NEGOTIATE ONLY WHEN USER INSISTS**: After user pushes back 2-3 times, THEN negotiate:
   - Full Plan: $189 → can go down to $150 MINIMUM (final price)
   - Manual Signals: $149 → can go down to $120 MINIMUM (final price)
4. **DON'T RUSH**: Take your time in negotiation. Don't give final price in 1-2 messages.
5. **CREATE URGENCY**: "This is a special once offer Sir, normally we don't negotiate."

📦 OTHER PRODUCTS:

**ACCOUNT MANAGEMENT (Ask for balance FIRST!):**
1. ALWAYS ask: "What is your current account balance Sir?"
2. Balance < $1000 → charge **15% management fee**
3. Balance >= $1000 → charge **10% management fee**

- Prop Firm: 1% of account size
- EAs: $40-$100

🚫 TELEGRAM:
- NEVER mention Telegram BEFORE payment!
- Keep clients on WhatsApp.

❌ NEVER DO:
- Never give up - keep selling!
- NEVER mention refunds/withdrawals!
- NEVER mention FlexyMarkets unless user specifically asks about brokers!

📚 KNOWLEDGE BASE:
${knowledgeBase}
${ragUsed ? `
📖 RELEVANT CHAT HISTORY:
${ragContext}` : ''} `
            },
            ...conversationHistory.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            })),
            {
                role: "user",
                content: imageUrl
                    ? [
                        { type: "text", text: userMessage },
                        { type: "image_url", image_url: { url: imageUrl } }
                    ]
                    : userMessage
            }
        ];

        const response = await axios.post(
            'https://api.x.ai/v1/chat/completions',
            {
                model: model,
                messages: messages
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data && response.data.choices && response.data.choices.length > 0) {
            return {
                text: response.data.choices[0].message.content,
                ragUsed,
                ragChunks
            };
        } else {
            console.error("Unexpected response from xAI:", JSON.stringify(response.data));
            return {
                text: "I apologize, I am having trouble connecting to my brain right now. Please try again later.",
                ragUsed: false,
                ragChunks: []
            };
        }

    } catch (error) {
        console.error("Error calling AI API:", error.response ? JSON.stringify(error.response.data) : error.message);
        return {
            text: "I apologize, but I'm currently experiencing technical difficulties.",
            ragUsed: false,
            ragChunks: []
        };
    }
}

module.exports = { generateReply };
