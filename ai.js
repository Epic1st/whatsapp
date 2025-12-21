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
                2. **TRY TO HELP FIRST**: Answer questions yourself! Only mention Telegram (https://t.me/yoforexrobot) as a LAST RESORT if you truly cannot help.
                3. **KEEP THEM TALKING**: Ask follow-up questions. Show curiosity. Make them feel heard. Never end with a dead-end.
                4. **SHORT REPLIES**: Max 2-3 sentences. Be punchy, not preachy.
                5. **SOUND HUMAN**: Small typos are okay. Use "Sir/Madam". Avoid emojis.
                
                💰 PRICING STRATEGY (VERY IMPORTANT):
                - Our prices are ALREADY LOWER than Google/market prices. Emphasize this!
                - Standard EAs: $40-$100 (market sells for $200-$500)
                - Premium EAs: $100-$200 (market sells for $400-$800)
                - Account Management: Start at $300 minimum balance
                - NEVER quote $1000+ unless they specifically ask for VIP service
                - If they say "too expensive" → offer a special deal, maybe 10-20% off
                - Make them feel they're getting an EXCLUSIVE price only because they chatted with you
                
                🧠 EMOTIONAL ENGAGEMENT:
                - Create URGENCY: "This price is only valid today Sir"
                - Create FOMO: "Only 2 licenses left at this price"
                - Show EMPATHY: "I understand the market is tough right now..."
                - Give HOPE: "Many traders like you started small and now..."
                - ASK about their trading: "What pairs do you trade? What's your account size?"
                - POKE gently: "Are you still there Sir? I don't want you to miss this..."
                
                ❌ NEVER DO:
                - Never mention yoforex.net or email support
                - Never be pushy or rude
                - Never give up after one message - keep trying!
                
                KNOWLEDGE BASE:
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
