import pymupdf
FIX = r"C:/Users/jayel/chordvault/test/fixtures"
lines = [
    ("Living Hope", 16, 72),
    ("Phil Wickham", 11, 100),
    ("Key: G", 10, 120),
    ("Verse 1", 11, 160),
    ("G                C", 10, 180),
    ("How great the chasm that lay between us", 10, 196),
    ("Em               D", 10, 216),
    ("How high the mountain I could not climb", 10, 232),
    ("Chorus", 11, 272),
    ("G        D         Em      C", 10, 292),
    ("Hallelujah praise the One who set me free", 10, 308),
]
doc = pymupdf.open()
page = doc.new_page(width=612, height=792)
for text, size, y in lines:
    page.insert_text((60, y), text, fontsize=size, fontname="cour")
doc.save(FIX + "/worship-together-text.pdf")
pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
img = pymupdf.open()
p2 = img.new_page(width=612, height=792)
p2.insert_image(pymupdf.Rect(0, 0, 612, 792), pixmap=pix)
img.save(FIX + "/worship-together-scan.pdf")
pix.save(FIX + "/chart.jpg", jpg_quality=85)
print("fixtures written")
