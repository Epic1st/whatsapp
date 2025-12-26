const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

// Initialize database
let db;

async function initDB() {
    if (db) return db;

    const dbPath = process.env.DB_FILE || './database.sqlite';
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Create tables if not exists
    await db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            whatsapp_number TEXT NOT NULL,
            role TEXT NOT NULL, -- 'user' or 'assistant'
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS processed_messages (
            message_id TEXT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS poke_counts (
            whatsapp_number TEXT PRIMARY KEY,
            poke_count INTEGER DEFAULT 0,
            last_poke DATETIME
        );
    `);

    // Create knowledge base table (optional, if we want to move from file to DB later)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log('Database initialized');
    return db;
}

// Increment poke count for a user
async function incrementPokeCount(number) {
    const database = await initDB();
    await database.run(`
        INSERT INTO poke_counts (whatsapp_number, poke_count, last_poke) 
        VALUES (?, 1, datetime('now'))
        ON CONFLICT(whatsapp_number) DO UPDATE SET 
            poke_count = poke_count + 1,
            last_poke = datetime('now')
    `, number);
}

// Reset poke count when user replies
async function resetPokeCount(number) {
    const database = await initDB();
    await database.run(`DELETE FROM poke_counts WHERE whatsapp_number = ?`, number);
}

// Get current poke count for a user
async function getPokeCount(number) {
    const database = await initDB();
    const row = await database.get(`SELECT poke_count FROM poke_counts WHERE whatsapp_number = ?`, number);
    return row ? row.poke_count : 0;
}

async function logMessage(number, role, content) {
    const database = await initDB();
    await database.run(
        'INSERT INTO conversations (whatsapp_number, role, content) VALUES (?, ?, ?)',
        number, role, content
    );
}

async function getConversationHistory(number, limit = 10) {
    const database = await initDB();
    const rows = await database.all(
        'SELECT role, content, timestamp FROM conversations WHERE whatsapp_number = ? ORDER BY timestamp DESC LIMIT ?',
        number, limit
    );
    // Reverse to get chronological order for the AI context
    return rows.reverse();
}

async function isMessageProcessed(messageId) {
    const database = await initDB();
    const row = await database.get('SELECT 1 FROM processed_messages WHERE message_id = ?', messageId);
    return !!row;
}

async function markMessageProcessed(messageId) {
    const database = await initDB();
    await database.run('INSERT OR IGNORE INTO processed_messages (message_id) VALUES (?)', messageId);

    // Periodically clean up old message IDs (keep last 7 days)
    await database.run("DELETE FROM processed_messages WHERE timestamp < datetime('now', '-7 days')");
}

async function getAllConversations() {
    const database = await initDB();
    const rows = await database.all(`
        SELECT whatsapp_number as waId, COUNT(*) as messageCount, MAX(timestamp) as lastMessage
        FROM conversations 
        GROUP BY whatsapp_number 
        ORDER BY lastMessage DESC
    `);
    return rows;
}

async function getAllMessages() {
    const database = await initDB();
    const rows = await database.all(`
        SELECT whatsapp_number as waId, role, content, timestamp
        FROM conversations 
        ORDER BY whatsapp_number, timestamp ASC
    `);
    return rows;
}

// Get clients who need a poke (11+ hours since last message, but within 24h of last USER message)
async function getClientsNeedingPoke() {
    const database = await initDB();
    const rows = await database.all(`
        WITH LastMessages AS (
            SELECT 
                whatsapp_number,
                MAX(CASE WHEN role = 'user' THEN timestamp END) as last_user_msg,
                MAX(timestamp) as last_any_msg
            FROM conversations
            GROUP BY whatsapp_number
        )
        SELECT 
            whatsapp_number as waId,
            last_user_msg,
            last_any_msg
        FROM LastMessages
        WHERE 
            -- User initiated conversation within last 24 hours (WATI window still open)
            last_user_msg > datetime('now', '-24 hours')
            -- But it's been 12+ hours since ANY message (time to poke)
            AND last_any_msg < datetime('now', '-12 hours')
    `);
    return rows;
}

module.exports = {
    initDB,
    logMessage,
    getConversationHistory,
    getAllConversations,
    getAllMessages,
    getClientsNeedingPoke,
    isMessageProcessed,
    markMessageProcessed,
    incrementPokeCount,
    resetPokeCount,
    getPokeCount
};
