import json
import os
from datetime import datetime

# Configuration
INPUT_FILE = 'result.json'
OUTPUT_FILE = 'knowledge_base.md'
MY_NAME = "YoForex Funds" # Based on the JSON analysis earlier

def get_text(msg):
    """
    Extracts text from a message object.
    Text in Telegram export can be a string or a list of strings/objects (for formatting).
    """
    text_content = msg.get('text', '')
    if isinstance(text_content, str):
        return text_content
    elif isinstance(text_content, list):
        full_text = ""
        for part in text_content:
            if isinstance(part, str):
                full_text += part
            elif isinstance(part, dict) and 'text' in part:
                 full_text += part['text']
        return full_text
    return ""

def format_date(timestamp_str):
    """Formats 2025-09-06T16:21:35 -> 2025-09-06 16:21"""
    try:
        dt = datetime.fromisoformat(timestamp_str)
        return dt.strftime("%Y-%m-%d %H:%M")
    except:
        return timestamp_str

def main():
    print(f"Loading {INPUT_FILE}...")
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: {INPUT_FILE} not found.")
        return
    except json.JSONDecodeError:
         print(f"Error: Failed to decode JSON from {INPUT_FILE}.")
         return

    chats = data.get('chats', {}).get('list', [])
    print(f"Found {len(chats)} chats. Processing...")

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        out.write("# Knowledge Base\n\n")
        out.write(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        out.write(f"Source: {INPUT_FILE}\n\n")

        chat_count = 0
        msg_count = 0

        for chat in chats:
            name = chat.get('name', 'Unknown Chat')
            chat_id = chat.get('id', 'N/A')
            messages = chat.get('messages', [])

            if not messages:
                continue
            
            # Simple filter: Only include chats with at least some back and forth? 
            # For now, let's include everything but filter empty texts.
            
            valid_messages = []
            for msg in messages:
                if msg.get('type') != 'message':
                    continue
                
                text = get_text(msg)
                if not text.strip():
                    continue
                
                sender = msg.get('from', 'Unknown')
                date = format_date(msg.get('date', ''))
                
                valid_messages.append({
                    'sender': sender,
                    'date': date,
                    'text': text
                })
            
            if not valid_messages:
                continue

            chat_count += 1
            msg_count += len(valid_messages)

            out.write(f"## Chat: {name} (ID: {chat_id})\n\n")
            
            for v_msg in valid_messages:
                # Use blockquote for messages to separate them visually
                out.write(f"> **{v_msg['sender']}** ({v_msg['date']}):  \n")
                # Indent text slightly or just put it on next line
                # Ensuring multi-line messages are handled nicely in markdown blockquotes
                formatted_text = v_msg['text'].replace('\n', '\n> ')
                out.write(f"> {formatted_text}\n\n")
            
            out.write("---\n\n")
            
            if chat_count % 100 == 0:
                print(f"Processed {chat_count} chats...")

    print(f"\nDone.")
    print(f"Total Chats Processed: {chat_count}")
    print(f"Total Messages Extracted: {msg_count}")
    print(f"Output saved to: {os.path.abspath(OUTPUT_FILE)}")

if __name__ == "__main__":
    main()
