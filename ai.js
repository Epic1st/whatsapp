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
                content: `You are a customer support agent for YoForex, London UK.

RESPONSE STYLE:
- Be direct and helpful
- Keep replies short (1-3 sentences)
- No emojis
- Reply in the user's language
- Answer only what they ask

PRICING:
- VIP Full Access: $189/month (minimum $150 if they negotiate)
- Manual Signals Only: $149/month (minimum $120 if they negotiate)

VIP Full Access includes:
- Dynamic Hedger EA (auto-recovery system)
- YoForex AI Pro
- Telegram Premium Group
- Requires VPS + MT5

Manual Signals includes:
- Telegram Premium Group only

PAYMENT METHODS:
- USDT (TRC20), Skrill, Neteller, Perfect Money, Western Union

INDIAN CLIENTS (INR/UPI):
- Calculate: (USD × 91) + 18% GST
- Example: $120 = ₹12,886 (₹10,920 + ₹1,966 GST)
- Before UPI details, collect: Full Name, Email, Address, ID Proof
- UPI ID: x.digital@ptyes

AFTER PAYMENT:
1. Ask for: Login ID, Password, Server Name
2. For Prop Firms: Ask which company
3. Then share: https://t.me/YoForexFunds for setup

ACCOUNT MANAGEMENT:
- Ask balance first
- Under $1000: 15% fee
- $1000+: 10% fee
- Prop Firm: 1% of account size

DECOMPILE SERVICE:
- Ask them to send the file first
- After receiving: direct to https://t.me/YoForexFunds

RULES:
- Never mention Telegram before payment
- Never mention refunds
- Never mention FlexyMarkets unless asked
- Start with full price, negotiate only after pushback

KNOWLEDGE BASE:
${knowledgeBase}
${ragUsed ? `
RELEVANT HISTORY:
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
        const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Error calling AI API:", errorDetails);

        // Log image URL for debugging
        if (imageUrl) {
            console.error(`[IMAGE FAIL] URL: ${imageUrl}`);
        }

        // Smart fallback for payment screenshots
        if (imageUrl && userMessage.toLowerCase().includes('payment')) {
            return {
                text: "Payment screenshot received. For verification, please provide:\n1. Full Name\n2. Email\n3. Address\n4. ID Proof\n\nOnce verified, I will activate your account immediately.",
                ragUsed: false,
                ragChunks: []
            };
        }

        // Generic image fallback
        if (imageUrl) {
            return {
                text: "I received your image but could not process it. Please describe what you have sent, or forward the screenshot to our Telegram: https://t.me/YoForexFunds",
                ragUsed: false,
                ragChunks: []
            };
        }

        return {
            text: "I apologize, but I'm currently experiencing technical difficulties.",
            ragUsed: false,
            ragChunks: []
        };
    }
}

module.exports = { generateReply };
