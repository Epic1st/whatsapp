const axios = require('axios');

const WATI_URL = process.env.WATI_API_ENDPOINT || 'https://live-mt-server.wati.io/436184';
const TOKEN = process.env.WATI_ACCESS_TOKEN;

// Helper to get fresh headers
function getHeaders() {
    return {
        'Authorization': TOKEN, // WATI usually expects "Bearer <token>" but we already have Bearer in env
        'Content-Type': 'application/json'
    };
}

async function sendMessage(whatsappNumber, text) {
    try {
        const url = `${WATI_URL}/api/v1/sendSessionMessage/${whatsappNumber}`;

        // Note: WATI sometimes requires query param for phone number too, but path param is primary
        // Let's stick to the path param as per Send Session Message docs found

        const response = await axios.post(url, null, {
            params: {
                messageText: text
            },
            headers: getHeaders()
        });

        console.log(`Message sent to ${whatsappNumber}:`, response.data);
        return response.data;
    } catch (error) {
        console.error(`Failed to send message to ${whatsappNumber}:`, error.message);
        if (error.response) {
            console.error('WATI Error Response:', error.response.data);
        }
        throw error;
    }
}

// Just in case we need to rotate tokens or do other things
// For now, only sending message is critical

module.exports = {
    sendMessage
};
