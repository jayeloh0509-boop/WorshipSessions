import sys
from pathlib import Path
import pymupdf

if len(sys.argv) != 3:
    raise SystemExit("usage: render_pdf_pages.py INPUT.pdf OUTPUT.png")
source = Path(sys.argv[1])
output = Path(sys.argv[2])
doc = pymupdf.open(source)
if doc.page_count == 0:
    raise SystemExit("PDF has no pages")
page_count = min(doc.page_count, 4)
width = max(doc.load_page(i).rect.width for i in range(page_count))
gap = 18
heights = [doc.load_page(i).rect.height * width / doc.load_page(i).rect.width for i in range(page_count)]
height = sum(heights) + gap * (page_count - 1)
contact = pymupdf.open()
canvas = contact.new_page(width=width, height=height)
y = 0
for index, page_height in enumerate(heights):
    rect = pymupdf.Rect(0, y, width, y + page_height)
    canvas.show_pdf_page(rect, doc, index, keep_proportion=True)
    y += page_height + gap
pix = canvas.get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25), alpha=False)
output.parent.mkdir(parents=True, exist_ok=True)
pix.save(output, jpg_quality=82)
print(page_count)
