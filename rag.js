/**
 * RAG (Retrieval-Augmented Generation) Module
 * Provides context retrieval from chat history chunks for smarter AI responses
 */

const fs = require('fs');
const path = require('path');

// Path to RAG chunks file
const RAG_DATA_PATH = path.join(__dirname, 'Chat Data for traning AI Model and Knowledgebase', 'rag_chunks.json');

// In-memory store for chunks
let ragChunks = [];
let isLoaded = false;

/**
 * Load RAG chunks from JSON file into memory
 */
function loadChunks() {
    try {
        if (!fs.existsSync(RAG_DATA_PATH)) {
            console.log('[RAG] Data file not found:', RAG_DATA_PATH);
            return false;
        }

        const startTime = Date.now();
        const data = fs.readFileSync(RAG_DATA_PATH, 'utf8');
        ragChunks = JSON.parse(data);
        isLoaded = true;

        const duration = Date.now() - startTime;
        console.log(`[RAG] Loaded ${ragChunks.length} chunks in ${duration}ms`);
        return true;
    } catch (error) {
        console.error('[RAG] Error loading chunks:', error.message);
        return false;
    }
}

/**
 * Get RAG status
 */
function getStatus() {
    return {
        isLoaded,
        chunkCount: ragChunks.length,
        dataPath: RAG_DATA_PATH
    };
}

/**
 * Search for relevant chunks based on query
 * Uses keyword overlap + frequency scoring (similar to test_rag_bot.py)
 * 
 * @param {string} query - User query to search for
 * @param {number} topK - Number of top results to return (default: 3)
 * @returns {Array} Array of {score, chunk} objects
 */
function search(query, topK = 3) {
    if (!isLoaded || ragChunks.length === 0) {
        return [];
    }

    // Extract words from query (lowercase, filter short words)
    const queryWords = query.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2)
        .map(w => w.replace(/[^\w]/g, '')); // Remove punctuation

    if (queryWords.length === 0) {
        return [];
    }

    const scores = [];

    for (const chunk of ragChunks) {
        const contentLower = chunk.content.toLowerCase();
        let score = 0;

        for (const word of queryWords) {
            // Count occurrences
            const regex = new RegExp(word, 'gi');
            const matches = contentLower.match(regex);
            if (matches) {
                // Base score + bonus for multiple occurrences
                score += 1 + (0.1 * matches.length);
            }
        }

        if (score > 0) {
            scores.push({ score, chunk });
        }
    }

    // Sort by score descending and return top K
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
}

/**
 * Retrieve context for a query formatted for AI prompt injection
 * 
 * @param {string} query - User query
 * @param {number} topK - Number of chunks to retrieve (default: 3)
 * @param {number} maxChars - Maximum characters for context (default: 2000)
 * @returns {Object} {context: string, chunks: Array, used: boolean}
 */
function retrieveContext(query, topK = 3, maxChars = 2000) {
    const results = search(query, topK);

    if (results.length === 0) {
        return {
            context: '',
            chunks: [],
            used: false
        };
    }

    // Build context string from top chunks
    let context = '';
    const usedChunks = [];

    for (const result of results) {
        const chunkPreview = result.chunk.content.substring(0, 800);
        const addition = `\n--- From: ${result.chunk.source} ---\n${chunkPreview}\n`;

        // Check if adding this chunk exceeds limit
        if (context.length + addition.length > maxChars) {
            break;
        }

        context += addition;
        usedChunks.push({
            id: result.chunk.id,
            source: result.chunk.source,
            score: result.score.toFixed(2)
        });
    }

    return {
        context: context.trim(),
        chunks: usedChunks,
        used: context.length > 0
    };
}

// Auto-load on module import
loadChunks();

module.exports = {
    loadChunks,
    getStatus,
    search,
    retrieveContext
};
