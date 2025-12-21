const axios = require('axios');
const { initDB, getConversationHistory } = require('./database');
const { spawn } = require('child_process');

async function runTest() {
    console.log('--- Starting Test ---');

    // 1. Start Server
    const serverProcess = spawn('node', ['server.js'], { stdio: 'inherit' });

    // Give it time to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        // 2. Mock Webhook Call
        const testPayload = {
            waId: "1234567890", // Test number
            text: "Do you offer a demo account?",
            senderName: "Test User",
            type: "text"
        };

        console.log('Sending mock webhook...');
        try {
            const res = await axios.post('http://localhost:3000/webhook', testPayload);
            console.log('Webhook Response:', res.status, res.data);
        } catch (e) {
            console.error('Webhook failed:', e.message);
        }

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 3. Check Database
        const history = await getConversationHistory("1234567890");
        console.log('\n--- Conversation History in DB ---');
        console.table(history);

        if (history.length >= 2) {
            console.log('SUCCESS: User message and AI reply found in DB.');
            const lastMsg = history[history.length - 1];
            if (lastMsg.role === 'assistant' && lastMsg.content.includes("demo account")) {
                console.log('VERIFIED: AI replied correctly about demo account.');
            } else {
                console.log('WARNING: AI reply might be incorrect or missing.');
            }
        } else {
            console.error('FAILURE: Not enough messages in history.');
        }

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        // Cleanup
        serverProcess.kill();
        process.exit(0);
    }
}

runTest();
