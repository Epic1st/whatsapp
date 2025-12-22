import json


file_path = 'result.json'

try:
    with open(file_path, 'rb') as f:
        # Stream the file to avoid loading everything if possible, though ijson is good for that.
        # But for simplicity, let's try to just read partial or use ijson to get keys.
        # Actually 160MB is small enough for standard json.load for structure checking.
        data = json.load(f)
        
        print("Top level keys:", list(data.keys()))
        
        if 'chats' in data:
            print("Found 'chats' key.")
            chats = data['chats']
            if isinstance(chats, dict) and 'list' in chats:
                print("Chats structure: dict with 'list'")
                chat_list = chats['list']
            elif isinstance(chats, list):
                print("Chats structure: list")
                chat_list = chats
            else:
                print("Unknown chats structure:", type(chats))
                chat_list = []

            print(f"Number of chats: {len(chat_list)}")
            
            if len(chat_list) > 0:
                print("Sample Chat 0 Keys:", list(chat_list[0].keys()))
                if 'messages' in chat_list[0]:
                    print("Sample Message 0 Keys:", list(chat_list[0]['messages'][0].keys()))
                    # Print a sample message text
                    for msg in chat_list[0]['messages'][:5]:
                        if 'text' in msg:
                           print("Sample text:", msg['text'])
        
except Exception as e:
    print(f"Error: {e}")
