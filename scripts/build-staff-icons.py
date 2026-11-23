#!/usr/bin/env python3
"""Build the staff web-app icons from images/lvlup-logo.png.

The mark is recolored white (coverage comes from the logo's own pixels).
The background is the dominant blue in that file (#005EFF). "STAFF" is
Inter Bold. 16 and 32 favicons drop the word so the mark stays readable.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "images" / "lvlup-logo.png"
OUT = ROOT / "icons"


def find_font():
    """Inter Bold, the same family the CRM preview sets as its UI font."""
    candidates = [
        Path("/usr/share/fonts/truetype/macos/Inter-Bold.ttf"),
        Path("/usr/share/fonts/truetype/inter/Inter-Bold.ttf"),
        Path("/Library/Fonts/Inter-Bold.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return str(path)
    raise SystemExit("Inter Bold was not found. Install it, then rerun this script.")


FONT = find_font()

# Dominant opaque color of images/lvlup-logo.png.
BLUE = (0, 94, 255)  # #005EFF
WHITE = (255, 255, 255)


def white_mark():
    """Return an RGBA image of the logo ink, cropped, recolored white."""
    src = Image.open(LOGO).convert("RGB")
    w, h = src.size
    pix = src.load()
    mark = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mp = mark.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = pix[x, y]
            # The file is the blue mark on white. Red is 0 in the ink and
            # 255 in the paper, so it is the coverage channel.
            coverage = 255 - r
            if coverage < 8:
                continue
            mp[x, y] = (255, 255, 255, coverage)
            if x < minx:
                minx = x
            if y < miny:
                miny = y
            if x > maxx:
                maxx = x
            if y > maxy:
                maxy = y
    # One pixel of the original padding so antialiased edges are not clipped.
    pad = 2
    box = (
        max(0, minx - pad),
        max(0, miny - pad),
        min(w, maxx + 1 + pad),
        min(h, maxy + 1 + pad),
    )
    return mark.crop(box)


def tracked_text(text, font, tracking, fill=WHITE):
    """Draw a single line with extra space between letters. Returns RGBA."""
    widths = [font.getlength(ch) for ch in text]
    total = int(math.ceil(sum(widths) + tracking * (len(text) - 1))) + 4
    # Vertical room from the font's ink, not the em box, so the gap is real.
    bbox = font.getbbox(text)
    top, bottom = bbox[1], bbox[3]
    height = bottom - top + 4
    img = Image.new("RGBA", (total, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    x = 2
    for ch, width in zip(text, widths):
        draw.text((x, 2 - top), ch, font=font, fill=fill)
        x += width + tracking
    # Crop to the painted pixels so centering uses the ink.
    ink = img.getbbox()
    return img.crop(ink) if ink else img


def compose(size, mark, with_label):
    """Square icon. Label and mark stay inside the maskable safe circle."""
    canvas = Image.new("RGB", (size, size), BLUE)
    if not with_label:
        # Favicon: mark only, large enough to read at 16px.
        target = int(round(size * 0.68))
        scale = target / max(mark.size)
        mw = max(1, int(round(mark.size[0] * scale)))
        mh = max(1, int(round(mark.size[1] * scale)))
        resized = mark.resize((mw, mh), Image.Resampling.LANCZOS)
        canvas.paste(resized, ((size - mw) // 2, (size - mh) // 2), resized)
        return canvas

    # Tuned on the 1024 master, then used at every labeled size so the
    # lockup matches. The word is large enough to read on a phone icon
    # (about the size of an iOS home-screen label) and still sits, with
    # the mark, inside the center 80% circle.
    mark_h = int(round(size * 0.40))
    scale = mark_h / mark.size[1]
    mw = max(1, int(round(mark.size[0] * scale)))
    mh = max(1, int(round(mark.size[1] * scale)))
    resized = mark.resize((mw, mh), Image.Resampling.LANCZOS)

    font_size = max(12, int(round(size * 0.155)))
    tracking = font_size * 0.06
    font = ImageFont.truetype(FONT, font_size)
    label = tracked_text("STAFF", font, tracking)

    gap = int(round(size * 0.045))
    block_h = mh + gap + label.size[1]
    top = (size - block_h) // 2
    # Nudge up a hair so the word's visual weight doesn't drag the group down.
    top -= int(round(size * 0.012))
    canvas.paste(resized, ((size - mw) // 2, top), resized)
    lx = (size - label.size[0]) // 2
    ly = top + mh + gap
    canvas.paste(label, (lx, ly), label)
    return canvas


def in_safe_zone(img, margin=0.10):
    """True when non-background pixels sit inside the maskable safe circle."""
    w, h = img.size
    cx = cy = (w - 1) / 2
    radius = (w * (1 - 2 * margin)) / 2
    pix = img.load()
    outside = 0
    for y in range(h):
        for x in range(w):
            r, g, b = pix[x, y]
            # Ignore the flat background and faint antialiasing on it.
            if abs(r - BLUE[0]) < 18 and abs(g - BLUE[1]) < 18 and abs(b - BLUE[2]) < 28:
                continue
            if (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2:
                outside += 1
    return outside == 0, outside


def main():
    OUT.mkdir(exist_ok=True)
    mark = white_mark()
    mark.save(OUT / "lvlup-mark-white.png")

    master = compose(1024, mark, True)
    ok, n = in_safe_zone(master)
    if not ok:
        raise SystemExit(f"master leaves the maskable safe zone ({n} px)")
    master.save(OUT / "icon-1024.png", optimize=True)

    labeled = {
        "icon-512.png": 512,
        "icon-512-maskable.png": 512,
        "icon-192.png": 192,
        "icon-192-maskable.png": 192,
        "apple-touch-icon.png": 180,
    }
    for name, size in labeled.items():
        img = compose(size, mark, True)
        ok, n = in_safe_zone(img)
        if not ok:
            raise SystemExit(f"{name} leaves the maskable safe zone ({n} px)")
        # Apple touch and the installed icons are opaque.
        img.save(OUT / name, optimize=True)

    for name, size in (("favicon-32.png", 32), ("favicon-16.png", 16)):
        img = compose(size, mark, False)
        img.save(OUT / name, optimize=True)

    fav32 = Image.open(OUT / "favicon-32.png").convert("RGBA")
    fav16 = Image.open(OUT / "favicon-16.png").convert("RGBA")
    fav32.save(
        ROOT / "favicon.ico",
        format="ICO",
        append_images=[fav16],
        sizes=[(16, 16), (32, 32)],
    )

    print("wrote", OUT)
    print("safe zone ok")
    for p in sorted(OUT.iterdir()):
        im = Image.open(p)
        print(f"  {p.name:28} {im.size} {im.mode}")


if __name__ == "__main__":
    main()
