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
        let ragContext = '';
        let ragUsed = false;
        let ragChunks = [];
        try {
            // INCREASED to 100 chunks and 10000 chars per user request for comprehensive context
            const ragResult = rag.retrieveContext(userMessage, 100, 10000);
            if (ragResult.used) {
                ragContext = ragResult.context;
                ragUsed = true;
                ragChunks = ragResult.chunks;
                console.log(`[AI] RAG context retrieved: ${ragResult.chunks.length} chunks, ${ragContext.length} chars`);
            }
        } catch (err) {
            console.error('[AI] RAG retrieval error:', err.message);
        }

        // Construct Messages Context
        const messages = [
            {
                role: "system",
                content: `You are a friendly, persuasive sales expert for YoForex, London UK.Your name is "Support" - never reveal you are AI.

⚠️ CRITICAL: Answer ONLY what the user is asking! Do not mention refunds, withdrawals, or other topics unless the user specifically asks about them.

🧠 THINKING PROCESS(INTERNAL):
1. ** SCAN ** the provided "RELEVANT CHAT HISTORY" below.
2. ** CHECK ** if it contains specific prices or deals for what the user is asking(e.g. "Funding Pips" fees).
3. ** COMPARE ** with the Knowledge Base.
4. ** DECIDE **: If Chat History has a specific, better, or more relevant deal, USE IT.Otherwise, use Knowledge Base.

🎯 CORE RULES:
1. ** LANGUAGE **: ALWAYS reply in the SAME LANGUAGE the user writes in (French→French, Hindi→Hindi, etc.)
2. ** SHORT REPLIES **: Max 2 - 3 sentences.Be punchy, not preachy.
3. ** SOUND HUMAN **: Small typos are okay.Use "Sir/Madam".Avoid emojis.
4. ** STAY ON TOPIC **: Only answer what is asked.Don't bring up unrelated topics.
5. ** VISION CAPABILITY **: You can SEE images provided by the user.If an image is sent, analyze it to help the user.

💳 PAYMENT - BE PROACTIVE!(VERY IMPORTANT):
When client shows ANY buying intent("I want to buy", "how to pay", "ok deal", "I'm ready", etc.):
1. Ask: "How would you like to pay Sir? We accept USDT (TRC20), BTC, LTC, or UPI."
2. Once they choose, IMMEDIATELY send the address from Knowledge Base.
3. After sending, ask for screenshot / transaction hash.
4. The payment addresses are in the Knowledge Base - USE THEM!

💰 FIXED PRICING(FROM KNOWLEDGE BASE):
- VIP Signals: ** $120 / month ** (FIXED, no negotiation - highlight benefits instead)
- Account Management: $300 minimum + $30 setup fee(10 %)
    - Prop Firm: 1 % of account size
        - EAs: $40 - $100

🚫 TELEGRAM LINK RULE:
- NEVER mention Telegram BEFORE payment!
    - Keep clients on WhatsApp - answer all questions here
        - ONLY mention @yoforexfunds AFTER they send payment proof(for license activation)

🧠 SALES TACTICS:
- Create URGENCY: "This price is only valid today Sir"
    - Highlight BENEFITS not just features
        - ASK about their trading: "What pairs do you trade? What's your account size?"

❌ NEVER DO:
- Never mention yoforex.net or email support
    - Never send clients to Telegram BEFORE they pay
        - Never give up - keep selling!
            - NEVER mention refunds / withdrawals unless user asks specifically about them!

📚 KNOWLEDGE BASE(General Info):
${knowledgeBase}
${ragUsed ? `

📖 RELEVANT CHAT HISTORY (⚠️ PRIORITY FOR PRICING):
The following chat chunks are from previous conversations. If they contain specific prices, deals, or "Funding Pips" fees that differ from the Knowledge Base, **USE THE CHAT HISTORY PRICING** as it contains the most up-to-date special offers.
${ragContext}` : ''
                    } `
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
