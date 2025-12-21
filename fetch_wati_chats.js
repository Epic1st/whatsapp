/**
 * WATI Chat History Fetcher
 * Fetches all chat data from WATI API for AI training and knowledge base
 * 
 * Usage: node fetch_wati_chats.js [startDate] [endDate]
 * Example: node fetch_wati_chats.js 2024-01-01 2024-12-31
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const WATI_API_URL = process.env.WATI_API_URL;
const WATI_TOKEN = process.env.WATI_TOKEN;

// Parse command line args for date range
const args = process.argv.slice(2);
const startDate = args[0] ? new Date(args[0]) : new Date('2020-01-01');
const endDate = args[1] ? new Date(args[1]) : new Date();

console.log(`\n=== WATI Chat History Fetcher ===`);
console.log(`Fetching chats from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`);

const headers = {
    'Authorization': `Bearer ${WATI_TOKEN}`,
    'Content-Type': 'application/json'
};

async function fetchAllContacts() {
    console.log('Fetching contacts...');
    let allContacts = [];
    let pageNumber = 1;
    const pageSize = 100;

    while (true) {
        try {
            const response = await axios.get(
                `${WATI_API_URL}/api/v1/getContacts?pageSize=${pageSize}&pageNumber=${pageNumber}`,
                { headers }
            );

            const contacts = response.data.contact_list || response.data.contacts || response.data || [];

            if (!contacts.length) break;

            allContacts = allContacts.concat(contacts);
            console.log(`  Page ${pageNumber}: ${contacts.length} contacts (Total: ${allContacts.length})`);

            if (contacts.length < pageSize) break;
            pageNumber++;
        } catch (error) {
            console.error('Error fetching contacts:', error.response?.data || error.message);
            break;
        }
    }

    console.log(`Total contacts found: ${allContacts.length}\n`);
    return allContacts;
}

async function fetchMessagesForContact(waId, contactName) {
    let allMessages = [];
    let pageNumber = 1;
    const pageSize = 100;

    while (true) {
        try {
            const response = await axios.get(
                `${WATI_API_URL}/api/v1/getMessages/${waId}?pageSize=${pageSize}&pageNumber=${pageNumber}`,
                { headers }
            );

            const messages = response.data.messages || response.data || [];

            if (!messages.length) break;

            // Filter by date range
            const filteredMessages = messages.filter(msg => {
                const msgDate = new Date(msg.created || msg.timestamp || msg.time * 1000);
                return msgDate >= startDate && msgDate <= endDate;
            });

            allMessages = allMessages.concat(filteredMessages);

            if (messages.length < pageSize) break;
            pageNumber++;
        } catch (error) {
            // Some contacts may not have messages or access
            if (error.response?.status !== 404) {
                console.error(`  Error fetching messages for ${waId}:`, error.response?.data || error.message);
            }
            break;
        }
    }

    return allMessages;
}

async function main() {
    const allChats = [];

    // Step 1: Get all contacts
    const contacts = await fetchAllContacts();

    // Step 2: For each contact, fetch their messages
    console.log('Fetching messages for each contact...\n');

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const waId = contact.wAid || contact.waId || contact.whatsappNumber || contact.phone;
        const name = contact.name || contact.fullName || 'Unknown';

        if (!waId) continue;

        process.stdout.write(`[${i + 1}/${contacts.length}] ${waId} (${name})... `);

        const messages = await fetchMessagesForContact(waId, name);

        if (messages.length > 0) {
            allChats.push({
                waId,
                name,
                messageCount: messages.length,
                messages: messages.map(m => ({
                    id: m.id || m.whatsappMessageId,
                    text: m.text || m.message || m.body,
                    isOwner: m.owner || m.isOwner || false,
                    status: m.statusString || m.status,
                    timestamp: m.created || m.timestamp || (m.time ? new Date(m.time * 1000).toISOString() : null),
                    type: m.type || 'text'
                }))
            });
            console.log(`${messages.length} messages`);
        } else {
            console.log('No messages in date range');
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    // Step 3: Save to JSON file
    const outputFile = `wati_chats_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(allChats, null, 2));

    // Summary
    const totalMessages = allChats.reduce((sum, c) => sum + c.messageCount, 0);
    console.log(`\n=== SUMMARY ===`);
    console.log(`Contacts with messages: ${allChats.length}`);
    console.log(`Total messages: ${totalMessages}`);
    console.log(`Saved to: ${outputFile}`);

    // Step 4: Generate training data format
    const trainingFile = `training_data_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.txt`;
    let trainingData = '';

    allChats.forEach(chat => {
        trainingData += `\n--- Conversation with ${chat.waId} ---\n`;
        chat.messages.forEach(msg => {
            const role = msg.isOwner ? 'Agent' : 'Customer';
            trainingData += `${role}: ${msg.text}\n`;
        });
    });

    fs.writeFileSync(trainingFile, trainingData);
    console.log(`Training data saved to: ${trainingFile}`);
}

main().catch(console.error);
