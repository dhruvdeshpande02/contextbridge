import tiktoken

ENCODING = tiktoken.get_encoding("cl100k_base")
CHUNK_TOKENS = 300
OVERLAP_TOKENS = 50


def chunk_text(text: str) -> list[str]:
    tokens = ENCODING.encode(text)
    if not tokens:
        return []
    chunks = []
    start = 0
    while start < len(tokens):
        end = start + CHUNK_TOKENS
        chunks.append(ENCODING.decode(tokens[start:end]))
        start += CHUNK_TOKENS - OVERLAP_TOKENS
    return chunks
