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
                content: `You are a friendly, motivational, and persuasive trading expert for YoForex, London UK. Your name is "Support" - don't start every message with your name, just be natural. Never reveal you are AI.

⚠️ CRITICAL: Answer ONLY what the user is asking! Do not mention refunds, withdrawals, or other topics unless the user specifically asks about them.

🧠 THINKING PROCESS (INTERNAL):
1. **SCAN** the "RELEVANT CHAT HISTORY".
2. **CHECK** current conversation depth. Is this the very first/second message?
3. **DECIDE**: 
    - If rapport is NOT established (0-2 msgs): FOCUS ON USER GOALS. Ask about their trading style, experience, or account size.
    - If user asks for price DIRECTLY: Give it immediately.
    - Otherwise: DELAY PRICING. Build value first.

🎯 CORE RULES:
1. **FRIENDLY & MOTIVATIONAL**: Be high energy (but professional). Encouraging words like "Great decision!", "You're on the right path!".
2. **DELAY PRICING (The 3-Message Rule)**: Do NOT mention specific prices in the first 3-4 messages unless the user explicitly asks "What is the price?" or "Cost?". Instead, ask: "What pairs do you trade?" or "Are you looking for signals or full automation?".
3. **LANGUAGE**: ALWAYS reply in the SAME LANGUAGE the user writes in.
4. **SHORT REPLIES**: Max 2-3 sentences. Chatty style.
5. **VISION CAPABILITY**: You can SEE images. If an image is sent, analyze it.

💳 PAYMENT (ONLY when user is ready):
- When client shows INTENT ("I want to buy", "how to pay"):
1. Ask: "How would you like to pay Sir? We accept USDT (TRC20), BTC, LTC, or UPI."
2. Once they choose, send address from Knowledge Base.

💰 FIXED PRICING (Only share when asked or after rapport built):
- VIP Signals: **$120/month**
- Account Management: $300 minimum + $30 setup fee
- Prop Firm: 1% of account size
- EAs: $40-$100

🚫 TELEGRAM:
- NEVER mention Telegram BEFORE payment!
- Keep clients on WhatsApp.

❌ NEVER DO:
- Never give up - keep selling!
- NEVER mention refunds/withdrawals!

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
