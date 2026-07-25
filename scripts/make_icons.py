#!/usr/bin/env python3
"""Generate PWA/app icons for Line-Sweep-Pro with no external deps.

Motif: a "rising milestone sweep" — an upward line chart with milestone dots,
on a blue gradient (a nod to the Mets-flavored blue/orange of the motion manager).
"""
import zlib
import struct
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")


def lerp(a, b, t):
    return a + (b - a) * t


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


BLUE_TOP = hex_rgb("#1d4ed8")     # blue-700
BLUE_BOT = hex_rgb("#3b82f6")     # blue-500
ORANGE = hex_rgb("#fb923c")       # orange-400
WHITE = (255, 255, 255)


def blend(dst, src, alpha):
    return tuple(int(round(lerp(dst[i], src[i], alpha))) for i in range(3))


def make(size):
    # framebuffer of (r,g,b,a)
    buf = [[[0, 0, 0, 255] for _ in range(size)] for _ in range(size)]

    # gradient background (top->bottom) with a soft diagonal light
    for y in range(size):
        t = y / (size - 1)
        base = blend(BLUE_TOP, BLUE_BOT, t)
        for x in range(size):
            # subtle diagonal sheen
            d = (x + y) / (2 * (size - 1))
            col = blend(base, WHITE, 0.06 * (1 - d))
            buf[y][x][0], buf[y][x][1], buf[y][x][2] = col

    def set_px(x, y, color, a=1.0):
        if 0 <= x < size and 0 <= y < size:
            px = buf[y][x]
            px[0], px[1], px[2] = blend((px[0], px[1], px[2]), color, a)

    def disc(cx, cy, r, color, a=1.0):
        r2 = r * r
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                dx, dy = x - cx, y - cy
                dist2 = dx * dx + dy * dy
                if dist2 <= r2:
                    set_px(x, y, color, a)
                else:
                    # anti-alias edge
                    edge = math.sqrt(dist2) - r
                    if edge < 1.5:
                        set_px(x, y, color, a * max(0, 1 - edge / 1.5))

    def thick_line(p0, p1, w, color):
        (x0, y0), (x1, y1) = p0, p1
        length = math.hypot(x1 - x0, y1 - y0)
        steps = int(length) + 1
        for i in range(steps + 1):
            t = i / steps
            disc(lerp(x0, x1, t), lerp(y0, y1, t), w / 2, color)

    # rising milestone path (in unit space 0..1, y down)
    pts_u = [(0.16, 0.72), (0.38, 0.56), (0.58, 0.63), (0.84, 0.28)]
    pts = [(px * size, py * size) for (px, py) in pts_u]
    lw = max(2, size * 0.055)

    # white connecting line
    for i in range(len(pts) - 1):
        thick_line(pts[i], pts[i + 1], lw, WHITE)

    # milestone dots (orange with white ring) — last one bigger (the goal)
    for i, (x, y) in enumerate(pts):
        big = (i == len(pts) - 1)
        r = size * (0.085 if big else 0.058)
        disc(x, y, r + size * 0.018, WHITE)
        disc(x, y, r, ORANGE)

    return buf


def write_png(path, buf):
    size = len(buf)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            px = buf[y][x]
            raw += bytes((px[0], px[1], px[2], px[3]))

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        crc = zlib.crc32(typ + data) & 0xffffffff
        return c + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("wrote", path)


os.makedirs(OUT, exist_ok=True)
for s, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    write_png(os.path.join(OUT, name), make(s))
