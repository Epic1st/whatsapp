import json
import os

INPUT_FILE = 'knowledge_base.md'
OUTPUT_FILE = 'rag_chunks.json'

def parse_knowledge_base(file_path):
    chunks = []
    current_chat_lines = []
    current_header = ""
    
    # We'll read line by line to avoid memory/regex issues with large files
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line_strip = line.strip()
            # Detect start of a new chat
            if line.startswith("## Chat:"):
                # Save previous chat if it exists
                if current_header:
                    save_chat(chunks, current_header, current_chat_lines)
                
                # Start new chat
                current_header = line_strip
                current_chat_lines = []
            else:
                if current_header: # Only accumulate if we are inside a chat section
                    current_chat_lines.append(line)
        
        # Save the last chat
        if current_header:
            save_chat(chunks, current_header, current_chat_lines)
            
    return chunks

def save_chat(chunks_list, header, lines):
    # Reassemble the body
    body = "".join(lines)
    
    # Simple chunking logic
    limit = 1500
    overlap = 200
    
    if len(body) > limit:
        start = 0
        while start < len(body):
            end = min(start + limit, len(body))
            # Adjust end to nearest newline to be safe
            if end < len(body):
                searched_chunk = body[start:end]
                last_nl = searched_chunk.rfind('\n')
                if last_nl != -1 and last_nl > limit * 0.5:
                    end = start + last_nl
            
            chunk_content = body[start:end].strip()
            if chunk_content:
                chunks_list.append({
                    "id": f"chunk_{len(chunks_list)}",
                    "source": header,
                    "content": header + "\n" + chunk_content
                })
            
            start += (len(chunk_content) - overlap)
            # Prevent infinite loop if overlap >= length
            if len(chunk_content) <= overlap:
                break
    else:
        if body.strip():
            chunks_list.append({
                "id": f"chunk_{len(chunks_list)}",
                "source": header,
                "content": header + "\n" + body.strip()
            })

def main():
    print(f"Reading {INPUT_FILE}...")
    if not os.path.exists(INPUT_FILE):
        print("File not found.")
        return

    chunks = parse_knowledge_base(INPUT_FILE)
    print(f"Generated {len(chunks)} chunks.")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(chunks, f, indent=2)
    
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
