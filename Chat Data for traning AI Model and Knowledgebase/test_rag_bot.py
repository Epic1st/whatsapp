import json
import sys
import os

# Simple local search (Keyword overlap + basic frequency)
# In production, use Vector Embeddings (OpenAI / Cohere) + Vector DB (Pinecone / Qdrant)

DATA_FILE = 'rag_chunks.json'

def load_data():
    if not os.path.exists(DATA_FILE):
        print(f"Data file {DATA_FILE} not found. Run prepare_rag_data.py first.")
        return []
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def search(query, chunks, top_k=3):
    query_words = set(query.lower().split())
    
    scores = []
    for chunk in chunks:
        content_lower = chunk['content'].lower()
        score = 0
        for word in query_words:
            # Basic term frequency scoring
            count = content_lower.count(word)
            if count > 0:
                score += 1 + (0.1 * count) # Bonus for multiple occurrences
        
        if score > 0:
            scores.append((score, chunk))
    
    # Sort by score descending
    scores.sort(key=lambda x: x[0], reverse=True)
    return scores[:top_k]

def main():
    chunks = load_data()
    print(f"Loaded {len(chunks)} chunks from knowledge base.")
    print("Type 'exit' to quit.")
    
    while True:
        query = input("\nEnter your question: ")
        if query.lower().strip() == 'exit':
            break
            
        results = search(query, chunks)
        
        if not results:
            print("No relevant info found.")
        else:
            print(f"\n--- Found {len(results)} matches ---")
            top_chunk = results[0][1]
            
            print(f"\n[Best Match] (Score: {results[0][0]:.2f})")
            print(f"Source: {top_chunk['source']}")
            print(f"Content Preview: {top_chunk['content'][:200]}...")
            
            print("\n" + "="*40)
            print(" WHAT THE AI WILL SEE (The Prompt) ")
            print("="*40)
            
            prompt = f"""
SYSTEM: You are a helpful support assistant for YoForex.
CONTEXT:
{top_chunk['content'][:1000]}... [truncated]

USER QUESTION: {query}

INSTRUCTION: Answer the user question using ONLY the context above.
"""
            print(prompt)
            print("="*40)
            print("The AI (GPT-4) would now generate an answer based on this.")


if __name__ == "__main__":
    main()
