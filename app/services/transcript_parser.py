"""
Parse meeting transcript files into plain text.

Supported formats:
  .txt  — read as-is
  .vtt  — WebVTT (Zoom, Google Meet, Teams auto-captions); strips timestamps + cue headers
  .docx — Word documents (Rev.com exports, hand-written minutes)
"""
import io
import re


def parse_transcript(filename: str, content: bytes) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "vtt":
        return _parse_vtt(content.decode("utf-8", errors="replace"))
    if ext == "txt":
        return content.decode("utf-8", errors="replace").strip()
    if ext == "docx":
        return _parse_docx(content)
    raise ValueError(f"Unsupported file type: .{ext}. Accepted: .vtt, .txt, .docx")


def _parse_vtt(text: str) -> str:
    """
    Strip WebVTT headers, cue identifiers, and timestamps.
    Keeps speaker-attributed lines like 'Alice: We decided to ship.'
    """
    lines = text.splitlines()
    out = []
    timestamp_re = re.compile(r"^\d{2}:\d{2}[\d:.,]* --> ")

    skip_header = True
    for line in lines:
        line = line.strip()
        # Skip the WEBVTT header block
        if skip_header:
            if line == "" or line.startswith("WEBVTT") or line.startswith("NOTE") or re.match(r"^[A-Z-]+:.*", line):
                continue
            skip_header = False
        # Skip blank lines, timestamp lines, and numeric cue identifiers
        if not line or timestamp_re.match(line) or line.isdigit():
            continue
        out.append(line)

    return "\n".join(out).strip()


def _parse_docx(content: bytes) -> str:
    try:
        from docx import Document  # python-docx
    except ImportError as exc:
        raise RuntimeError("python-docx is required for .docx parsing. Add it to requirements.txt.") from exc

    doc = Document(io.BytesIO(content))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)
