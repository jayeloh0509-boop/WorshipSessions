import json
import re
import sys

import pymupdf

CHORD_RE = re.compile(
    r"^[A-G][#b]?(?:(?:maj|min|m|sus|add|dim|aug|no)\d*|\d+)?(?:/[A-G][#b]?)?[.]*$"
)


def is_chord_row(words):
    return bool(words) and all(CHORD_RE.fullmatch(word[4]) for word in words)


def display_text(words):
    return " ".join(word[4] for word in sorted(words, key=lambda word: word[0]))


def normalize_lyric(text):
    return (
        text.replace(",.", ", ")
        .replace(";.", "; ")
        .replace(":.", ": ")
        .replace("..", " ")
        .replace(".", " ")
    )


def lyric_tokens(words):
    tokens = []
    for word in sorted(words, key=lambda item: item[0]):
        parts = word[4].split(".")
        if len(parts) == 1:
            tokens.append((word[0], word[2], parts[0]))
            continue
        span = max(1.0, word[2] - word[0])
        step = span / len(parts)
        for index, part in enumerate(parts):
            if part:
                tokens.append((word[0] + step * index, word[0] + step * (index + 1), part))
    return tokens


def inline_chords(chord_words, lyric_words):
    tokens = lyric_tokens(lyric_words)
    lyric = " ".join(token[2] for token in tokens)
    if not tokens or not lyric:
        return " ".join(f"[{word[4].rstrip('.')}]" for word in chord_words)

    boundary_positions = []
    text_index = 0
    for index, token in enumerate(tokens):
        boundary_positions.append((token[0], text_index))
        text_index += len(token[2])
        if index < len(tokens) - 1:
            text_index += 1
    placements = []
    for word in sorted(chord_words, key=lambda item: item[0]):
        _, index = min(boundary_positions, key=lambda boundary: abs(boundary[0] - word[0]))
        placements.append((index, word[4].rstrip(".")))

    result = lyric
    for index, chord in reversed(placements):
        result = f"{result[:index]}[{chord}]{result[index:]}"
    return result


def grouped_rows(page):
    words = page.get_text("words", sort=False)
    blocks = {}
    for word in words:
        blocks.setdefault(word[5], []).append(word)

    for block_number in sorted(blocks):
        block_words = blocks[block_number]
        rows = []
        for word in sorted(block_words, key=lambda item: (item[1], item[0])):
            row = next((candidate for candidate in rows if abs(candidate[0][1] - word[1]) <= 1.5), None)
            if row is None:
                row = []
                rows.append(row)
            row.append(word)
        for row in rows:
            row.sort(key=lambda item: item[0])
        yield rows


def worship_text(doc):
    output = []
    for page in doc:
        for rows in grouped_rows(page):
            index = 0
            while index < len(rows):
                row = rows[index]
                if is_chord_row(row) and index + 1 < len(rows) and not is_chord_row(rows[index + 1]):
                    output.append(inline_chords(row, rows[index + 1]))
                    index += 2
                    continue
                output.append(display_text(row))
                index += 1
    return "\n".join(output)


if len(sys.argv) not in (2, 3):
    raise SystemExit("usage: extract_pdf_text.py input.pdf [--layout-json|--worship-text]")

doc = pymupdf.open(sys.argv[1])
mode = sys.argv[2] if len(sys.argv) == 3 else ""
if mode == "--layout-json":
    pages = []
    for page in doc:
        words = page.get_text("words", sort=False)
        pages.append(
            {
                "width": page.rect.width,
                "height": page.rect.height,
                "words": [[*word[:4], word[4], *word[5:8]] for word in words],
            }
        )
    sys.stdout.write(json.dumps({"pages": pages}, ensure_ascii=False))
elif mode == "--worship-text":
    sys.stdout.write(worship_text(doc))
else:
    sys.stdout.write("\n".join(page.get_text("text", sort=True).rstrip("\n") for page in doc))
