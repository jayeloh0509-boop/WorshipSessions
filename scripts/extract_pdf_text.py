import json
import re
import sys

# Node reads subprocess output as UTF-8, including on Windows.
sys.stdout.reconfigure(encoding="utf-8")

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


# Broader than the WT-specific chord matcher: layout detection must not mistake
# widely spaced extended chords, bars, or beat markers for independent lyrics.
LAYOUT_CHORD_RE = re.compile(
    r"^[A-G][#b]?(?:(?:maj|min|m|sus|add|dim|aug|no)\d*|\d+|[-()+°ø∆Δ#b+])*(?:/[A-G][#b]?)?$"
)


def is_layout_music(text):
    tokens = re.split(r"[\s|.]+", text.strip())
    return all(
        not token
        or re.fullmatch(r"[/,:;\-]+|N\.?C\.?", token, re.IGNORECASE)
        or LAYOUT_CHORD_RE.fullmatch(token.strip("[](),;:"))
        for token in tokens
    )


def generic_text_fragments(page, gutter):
    # Use source line IDs, not sort=True's merged visual rows. Split even a
    # single PDF line if it contains a large horizontal jump between columns.
    lines = {}
    for word in page.get_text("words", sort=False):
        lines.setdefault((word[5], word[6]), []).append(word)
    fragments = []
    for words in lines.values():
        runs = []
        for word in sorted(words, key=lambda item: item[0]):
            if not runs or word[0] - runs[-1][-1][2] >= gutter:
                runs.append([])
            runs[-1].append(word)
        for words in runs:
            text = " ".join(word[4] for word in words)
            if is_layout_music(text) or len(re.findall(r"[^\W\d_]", text)) < 3:
                continue
            fragments.append((
                min(word[0] for word in words), min(word[1] for word in words),
                max(word[2] for word in words), max(word[3] for word in words),
            ))
    return fragments


def check_generic_layout(doc):
    # This is a conservative ambiguity gate, NOT a general reading-order
    # algorithm. Two repeated non-musical text streams separated by a gutter
    # and occupying overlapping vertical ranges cannot safely be fed to the
    # generic row parser. Headers/footers spanning the gutter do not hide them.
    # Coordinates are PDF points (72/in). No assumed page midpoint or column
    # count; staggered rows and off-centre columns are checked too.
    for page_number, page in enumerate(doc, start=1):
        gutter = max(24.0, page.rect.width * 0.04)
        fragments = generic_text_fragments(page, gutter)
        candidates = sorted({box[2] + gutter / 2 for box in fragments})
        for split in candidates:
            left = [box for box in fragments if box[2] <= split - gutter / 2 + 0.01]
            right = [box for box in fragments if box[0] >= split + gutter / 2 - 0.01]
            if len(left) < 2 or len(right) < 2:
                continue
            top = max(min(box[1] for box in left), min(box[1] for box in right))
            bottom = min(max(box[3] for box in left), max(box[3] for box in right))
            if bottom - top < 12:
                continue
            # Both streams must actually have repeated rows in the overlap.
            # A left-aligned header/footer surrounding an indented single
            # stream must not count as a second column spanning the page.
            active = [[box for box in side if box[3] >= top and box[1] <= bottom] for side in (left, right)]
            if any(len(side) < 2 or max(box[1] for box in side) - min(box[1] for box in side) < 8 for side in active):
                continue
            raise ValueError(
                f"Ambiguous multi-column PDF layout on page {page_number}; "
                "generic import cannot safely determine reading order. "
                "Use a supported publisher import or supply a single-column text chart."
            )


if len(sys.argv) not in (2, 3):
    raise SystemExit("usage: extract_pdf_text.py input.pdf [--layout-json|--worship-text|--check-layout]")

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
elif mode in ("", "--check-layout"):
    try:
        check_generic_layout(doc)
    except ValueError as error:
        raise SystemExit(str(error))
    if mode == "":
        sys.stdout.write("\n".join(page.get_text("text", sort=True).rstrip("\n") for page in doc))
else:
    raise SystemExit(f"Unknown extraction mode: {mode}")
