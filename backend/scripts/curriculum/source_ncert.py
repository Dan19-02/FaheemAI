#!/usr/bin/env python3
"""
Source REAL textbook content for CBSE grounding from NCERT.

NCERT textbooks are officially free/government-published (ncert.nic.in), which
is why this is a legitimate grounding corpus. Cambridge and Bahrain-MoE textbooks
are copyrighted and are NOT sourced here — those boards stay syllabus-scoped.

Pipeline per book:
  download chapter PDFs -> extract text (PyMuPDF) -> chunk per chapter/section
  with provenance -> write JSONL the TS seeder embeds + loads into corpus_chunks.

NCERT PDF code = <class><medium><subject><part>, chapter appended as 2 digits:
  class:  i=9  j=10  k=11  l=12
  medium: e = English
  e.g. jesc1 + "07" -> jesc107.pdf  (Class 10, English, Science, part 1, ch 7)

Usage:
  python3 source_ncert.py                 # source the DEFAULT proof set
  python3 source_ncert.py --all           # source every book in the map
  python3 source_ncert.py cbse.10.science # source one book by key
"""
from __future__ import annotations  # PEP 604 "X | None" hints on Python 3.9

import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

import fitz  # PyMuPDF

BASE = "https://ncert.nic.in/textbook/pdf"
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, "..", ".."))
PDF_DIR = os.path.join(BACKEND, "corpus-source", "ncert")   # gitignored (raw PDFs)
OUT_DIR = os.path.join(BACKEND, "corpus", "cbse")           # gitignored (derived JSONL)

# CBSE ↔ NCERT book map. `code` is the NCERT prefix; chapters are probed 01..N.
# Confident STEM set (the highest-value Type-A grounding); extend as needed.
BOOKS = {
    # key: (grade_equiv, subject_slug, subject_name, ncert_code, human_title)
    "cbse.9.science":    ("9",  "science",     "Science",     "iesc1", "Science (Class 9)"),
    "cbse.9.mathematics":("9",  "mathematics", "Mathematics", "iemh1", "Mathematics (Class 9)"),
    "cbse.10.science":   ("10", "science",     "Science",     "jesc1", "Science (Class 10)"),
    "cbse.10.mathematics":("10","mathematics", "Mathematics", "jemh1", "Mathematics (Class 10)"),
    "cbse.11.physics.p1":("11", "physics",     "Physics",     "keph1", "Physics Part I (Class 11)"),
    "cbse.11.physics.p2":("11", "physics",     "Physics",     "keph2", "Physics Part II (Class 11)"),
    "cbse.11.chemistry.p1":("11","chemistry",  "Chemistry",   "kech1", "Chemistry Part I (Class 11)"),
    "cbse.11.chemistry.p2":("11","chemistry",  "Chemistry",   "kech2", "Chemistry Part II (Class 11)"),
    "cbse.11.biology":   ("11", "biology",     "Biology",     "kebo1", "Biology (Class 11)"),
    "cbse.12.physics.p1":("12", "physics",     "Physics",     "leph1", "Physics Part I (Class 12)"),
    "cbse.12.physics.p2":("12", "physics",     "Physics",     "leph2", "Physics Part II (Class 12)"),
    "cbse.12.chemistry.p1":("12","chemistry",  "Chemistry",   "lech1", "Chemistry Part I (Class 12)"),
    "cbse.12.chemistry.p2":("12","chemistry",  "Chemistry",   "lech2", "Chemistry Part II (Class 12)"),
    "cbse.12.biology":   ("12", "biology",     "Biology",     "lebo1", "Biology (Class 12)"),
}

DEFAULT_SET = ["cbse.10.science"]  # small, fast proof of real textbook grounding

MAX_CH = 20            # probe chapters 01..MAX_CH
STOP_AFTER_MISSES = 2  # give up after this many consecutive 404s
TARGET_WORDS = 320     # ~ chunk size
OVERLAP_WORDS = 48     # ~15% overlap so a concept split across a boundary survives


def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Fahim curriculum ingest)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return data if len(data) > 2000 else None  # a stub/error page is tiny
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print(f"    HTTP {e.code} for {url}")
        return None
    except Exception as e:
        print(f"    error {url}: {e}")
        return None


def clean(text: str) -> str:
    text = text.replace(" ", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chapter_title(page_text: str, fallback: str) -> str:
    for line in page_text.splitlines():
        s = line.strip()
        # Skip page numbers, "Reprint", running heads; take the first real line.
        if len(s) >= 4 and not s.isdigit() and "reprint" not in s.lower():
            return s[:120]
    return fallback


def chunk_words(text: str):
    words = text.split()
    if not words:
        return
    i = 0
    while i < len(words):
        piece = words[i : i + TARGET_WORDS]
        yield " ".join(piece)
        if i + TARGET_WORDS >= len(words):
            break
        i += TARGET_WORDS - OVERLAP_WORDS


def source_book(key: str) -> int:
    grade_equiv, subject_slug, subject_name, code, title = BOOKS[key]
    os.makedirs(PDF_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{grade_equiv}-{subject_slug}.jsonl")
    # Append across parts (p1/p2) of the same subject; truncate on the first part.
    mode = "a" if key.endswith((".p2",)) else "w"
    records = 0
    misses = 0
    with open(out_path, mode, encoding="utf-8") as out:
        for ch in range(1, MAX_CH + 1):
            fname = f"{code}{ch:02d}.pdf"
            url = f"{BASE}/{fname}"
            data = fetch(url)
            if data is None:
                misses += 1
                if misses >= STOP_AFTER_MISSES:
                    break
                continue
            misses = 0
            with open(os.path.join(PDF_DIR, fname), "wb") as f:
                f.write(data)
            doc = fitz.open(stream=io.BytesIO(data), filetype="pdf")
            full = clean("\n".join(doc.load_page(p).get_text() for p in range(doc.page_count)))
            title_line = chapter_title(doc.load_page(0).get_text(), f"{subject_name} Chapter {ch}")
            for idx, chunk in enumerate(chunk_words(full)):
                if len(chunk) < 200:  # drop near-empty tail chunks
                    continue
                rec = {
                    "board": "cbse",
                    "gradeEquiv": grade_equiv,
                    "subjectSlug": subject_slug,
                    "subjectName": subject_name,
                    "chapterNum": ch,
                    "chapterTitle": title_line,
                    "sectionLabel": f"{title} · Ch {ch}",
                    "chunkIndex": idx,
                    "text": chunk,
                    "sourceUri": url,
                }
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                records += 1
            print(f"  {fname}: {doc.page_count}p -> chunks, running total {records}")
            time.sleep(0.5)  # be polite to ncert.nic.in
    print(f"[{key}] {records} chunks -> {out_path}")
    return records


def main():
    args = sys.argv[1:]
    if "--all" in args:
        keys = list(BOOKS.keys())
    elif args:
        keys = [a for a in args if a in BOOKS]
        if not keys:
            print(f"Unknown book key(s). Available:\n  " + "\n  ".join(BOOKS))
            sys.exit(1)
    else:
        keys = DEFAULT_SET
    total = 0
    for k in keys:
        print(f"== sourcing {k} ==")
        total += source_book(k)
    print(f"\nDONE: {total} chunks across {len(keys)} book(s). JSONL in {OUT_DIR}")


if __name__ == "__main__":
    main()
