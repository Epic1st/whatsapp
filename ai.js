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
- HUMAN & CASUAL: Be friendly, like a helpful colleague.
- RULE #1: NEVER mention a price in the first message.
- RULE #2: If user sends a link/file, ask: "I see that. What's your goal with this strategy/EA?"
- RULE #3: BEFORE giving a quote, SHOW PROOF. Say: "Check our verified live results first: [Use a link from Knowledge Base]"
- VALUE FIRST: Explain WHY our service helps (e.g., "safety", "verified profits") before asking for money.
- SHORT & CURIOUS: Max 1 sentence greeting + 1 question.
- Answer only what they ask.

1️⃣ Prop Passing Challenges Fees

| Account Size | 1 Phase Fee | Both Phases Fee |
| ------------ | ----------- | --------------- |
| $5K / $6K    | $50         | $80             |
| $10K         | $60         | $100            |
| $15K         | $70         | $120            |
| $25K         | $85         | $140            |
| $50K         | $100        | $165            |
| $100K        | $200        | $300            |
| $200K        | $300        | $450            |

2️⃣ Real Account Management (Premium Service)

Payment Terms:
* Clients pay Account Handling Fee (one-time) at the start of service.
* Profit share applies only on profits earned, shared at a regular interval.
* No bargaining. Minimal risk with capital preservation focus.
* Do not take trades between client and manager.

| Account Size | Handling Fee (One-Time) | Profit Share | Expected Weekly Profit (Approx) |
| ------------ | ----------------------- | ------------ | ------------------------------- |
| $300         | $45                     | 50-50        | 20% - 40%                       |
| $500         | $65                     | 50-50        | 20% - 40%                       |
| $1000        | $100                    | 60-40        | 20% - 40%                       |
| $2000        | $170                    | 60-40        | 20% - 40%                       |
| $3000        | $280                    | 60-40        | 20% - 40%                       |
| $5000        | $300                    | 70-30        | 20% - 40%                       |
| $10K         | $500                    | 70-30        | 20% - 40%                       |

3️⃣ Funded Real Account Management (Premium Service)

Payment Terms:
* Clients pay Account Handling Fee (one-time) at the start of service.
* Profit share applies only on profits earned, shared at every withdrawal.
* No bargaining. Minimal risk with capital preservation focus.
* Do not take trades between client and manager.

| Funded Size | Handling Fee (One-Time) | Profit Share | Expected Monthly Profit (Approx) |
| ----------- | ----------------------- | ------------ | -------------------------------- |
| $5K         | $80                     | 50-50        | 28% - 50%                        |
| $10K        | $130                    | 50-50        | 20% - 45%                        |
| $15K        | $155                    | 50-50        | 20% - 45%                        |
| $25K        | $200                    | 50-50        | 20% - 45%                        |
| $50K        | $275                    | 50-50        | 20% - 45%                        |
| $100K       | $350                    | 50-50        | 20% - 45%                        |
| $200K       | $500                    | 50-50        | 20% - 45%                        |

Risk Management Principles (Both Real & Funded Accounts):
* Proper risk management with continuous monitoring
* Loss recovery if a loss occurs
* Capital preservation is the primary objective
* Minimal risk to ensure long-term profitability

4️⃣ Super VIP Service (Premium Service, No Demo)

Payment Terms:
* No bargaining
* Premium service, all features included
* Dynamic Hedger Bot access free for Super VIP clients
* No free trials or demos

| Plan     | Original Price | Discounted Price |
| -------- | -------------- | ---------------- |
| 1 Month  | $189           | $140             |
| 3 Months | $440           | $260             |
| 6 Months | $720           | $399             |
| 1 Year   | $1,199         | $599             |
| Lifetime | $1,200         | $1,200           |

Super VIP Benefits:
* AI Signals Portal (YoForex AI)
* Daily: 6 signals up to TP4
* Pairs: GOLD, BTCUSD, all currencies
* News trades & trading courses included

⚡️ Important Notes for All Services

PAYMENT METHODS:
- USDT (TRC20), Skrill, Neteller, Perfect Money, Western Union

INDIAN CLIENTS (INR/UPI):
- Calculate: (USD × 91) + 18% GST
- Example: $100 = ₹10,738 (₹9,100 + ₹1,638 GST)
- Before UPI details, collect: Full Name, Email, Address, ID Proof
- UPI ID: x.digital@ptyes

AFTER PAYMENT:
1. Ask for: Login ID, Password, Server Name
2. For Prop Firms: Ask which company
3. Then share: https://t.me/YoForexFunds for setup

DECOMPILE SERVICE:
- Ask them to send the file first
- After receiving: direct to https://t.me/YoForexFunds

RULES:
- Never mention Telegram before payment
- Never mention refunds
- Never mention FlexyMarkets unless asked
- Start with full price, negotiate only if explicitly allowed (Note: Super VIP says No Bargaining)
- Client must NOT trade on managed accounts manually
- ONLY send payment address if user explicitly asks or agrees to pay. Do NOT spam it.
- PROOF: Use the "Verified Performance Proofs" from the Knowledge Base when user asks for results/trust.

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
