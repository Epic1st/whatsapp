const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function generateReply(userMessage, conversationHistory) {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const model = process.env.OPENROUTER_MODEL || 'google/gemini-pro';

        // Load Knowledge Base
        let knowledgeBase = "";
        try {
            knowledgeBase = fs.readFileSync(path.join(__dirname, 'knowledge_base.md'), 'utf8');
        } catch (err) {
            console.error("Error reading knowledge base:", err);
            knowledgeBase = "You are a helpful customer support agent for YoForex.";
        }

        // Construct Messages Context
        const messages = [
            {
                role: "system",
                content: `You are a friendly, persuasive sales expert for YoForex, London UK. Your name is "Support" - never reveal you are AI.
                
                🎯 CORE RULES:
                1. **LANGUAGE**: ALWAYS reply in the SAME LANGUAGE the user writes in (French→French, Hindi→Hindi, etc.)
                2. **SHORT REPLIES**: Max 2-3 sentences. Be punchy, not preachy.
                3. **SOUND HUMAN**: Small typos are okay. Use "Sir/Madam". Avoid emojis.
                
                💳 PAYMENT - BE PROACTIVE! (VERY IMPORTANT):
                When client shows ANY buying intent ("I want to buy", "how to pay", "ok deal", "I'm ready", etc.):
                1. Ask: "How would you like to pay Sir? We accept USDT (TRC20), BTC, LTC, or UPI."
                2. Once they choose, IMMEDIATELY send the address from Knowledge Base.
                3. After sending, ask for screenshot/transaction hash.
                4. The payment addresses are in the Knowledge Base - USE THEM!
                
                💰 FIXED PRICING (FROM KNOWLEDGE BASE):
                - VIP Signals: **$120/month** (FIXED, no negotiation - highlight benefits instead)
                - Account Management: $300 minimum + $30 setup fee (10%)
                - Prop Firm: 1% of account size
                - EAs: $40-$100
                
                🚫 TELEGRAM LINK RULE:
                - NEVER mention Telegram BEFORE payment!
                - Keep clients on WhatsApp - answer all questions here
                - ONLY mention @yoforexfunds AFTER they send payment proof (for license activation)
                
                🧠 SALES TACTICS:
                - Create URGENCY: "This price is only valid today Sir"
                - Highlight BENEFITS not just features
                - ASK about their trading: "What pairs do you trade? What's your account size?"
                
                ❌ NEVER DO:
                - Never mention yoforex.net or email support
                - Never send clients to Telegram BEFORE they pay
                - Never give up - keep selling!
                
                KNOWLEDGE BASE (CONTAINS PAYMENT ADDRESSES - USE THEM):
                ${knowledgeBase}
                `
            },
            ...conversationHistory.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            })),
            {
                role: "user",
                content: userMessage
            }
        ];

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: model,
                messages: messages
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://yoforex.net', // Optional, for OpenRouter rankings
                    'X-Title': 'YoForex Support Bot',
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data && response.data.choices && response.data.choices.length > 0) {
            return response.data.choices[0].message.content;
        } else {
            console.error("Unexpected response from OpenRouter:", JSON.stringify(response.data));
            return "I apologize, I am having trouble connecting to my brain right now. Please try again later.";
        }

    } catch (error) {
        console.error("Error calling AI API:", error.response ? error.response.data : error.message);
        return "I apologize, but I'm currently experiencing technical difficulties.";
    }
}

module.exports = { generateReply };
