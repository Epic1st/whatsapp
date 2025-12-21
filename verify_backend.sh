#!/bin/bash
SERVER="http://155.117.43.210:3000"
echo "=== 🧪 STARTING BACKEND API VERIFICATION ==="

# 1. Dashboard HTML
echo -n "1. Check Dashboard HTML Access... "
HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}\n" $SERVER/dashboard)
if [ "$HTTP_CODE" == "200" ]; then echo "✅ OK"; else echo "❌ FAIL ($HTTP_CODE)"; fi

# 2. Conversations List (Client Search & Counter source)
echo -n "2. Check Client List API (/api/conversations)... "
RESP=$(curl -s $SERVER/api/conversations)
if [[ "$RESP" == *"conversations"* ]]; then echo "✅ OK"; else echo "❌ FAIL"; fi

# 3. Knowledge Base (Load)
echo -n "3. Check KB Load API (/api/kb)... "
RESP=$(curl -s $SERVER/api/kb)
if [[ "$RESP" == *"content"* ]]; then echo "✅ OK"; else echo "❌ FAIL"; fi

# 4. Persistence / Pause AI
echo -n "4.1 Test Pause AI (POST /api/excluded/TEST999)... "
curl -s -X POST $SERVER/api/excluded/TEST999 > /dev/null
# Verify it's there
RESP=$(curl -s $SERVER/api/excluded)
if [[ "$RESP" == *"TEST999"* ]]; then echo "✅ OK"; else echo "❌ FAIL (Not persisted)"; fi

echo -n "4.2 Test Resume AI (DELETE /api/excluded/TEST999)... "
curl -s -X DELETE $SERVER/api/excluded/TEST999 > /dev/null
# Verify it's gone
RESP=$(curl -s $SERVER/api/excluded)
if [[ "$RESP" != *"TEST999"* ]]; then echo "✅ OK"; else echo "❌ FAIL (Still there)"; fi

# 5. Live Feed (Headers check)
echo -n "5. Check Live Feed Headers (/api/live)... "
HEADERS=$(curl -I -s $SERVER/api/live)
if [[ "$HEADERS" == *"text/event-stream"* ]]; then echo "✅ OK"; else echo "❌ FAIL"; fi

# 6. Manual Reply (Dry run validation)
echo -n "6. Test Manual Reply Validation (Missing args)... "
RESP=$(curl -s -X POST -H "Content-Type: application/json" -d '{}' $SERVER/api/send-message)
if [[ "$RESP" == *"Missing"* ]]; then echo "✅ OK (Correctly rejected)"; else echo "❌ FAIL (Should reject)"; fi

# 7. Messages Logic (Check endpoint exists)
echo -n "7. Check Message History Endpoint (/api/messages/123)... "
HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}\n" $SERVER/api/messages/123)
if [ "$HTTP_CODE" == "200" ]; then echo "✅ OK"; else echo "❌ FAIL"; fi

echo "=== ✅ VERIFICATION COMPLETE ==="
