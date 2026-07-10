"""Generate a valid .ico file for Tauri Windows builds.

Run: python scripts/generate_icons.py
"""

import struct
import os

ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
os.makedirs(ICONS_DIR, exist_ok=True)

def generate_ico(path: str, size: int = 32):
    """Generate a valid 32-bit ARGB .ico file that rc.exe accepts."""
    # Pixel data: bottom-up BMP rows, BGRA byte order
    pixels = bytearray()
    for y in range(size - 1, -1, -1):  # bottom-up
        for x in range(size):
            # Oceanix blue #007acc → BGRA
            pixels.extend([0xCC, 0x7A, 0x00, 0xFF])

    # BITMAPINFOHEADER (40 bytes)
    bmp_size = len(pixels)
    bih = struct.pack("<IiiHHIIiiII",
        40,           # biSize
        size,         # biWidth
        size * 2,     # biHeight (2x for ICO — top + bottom half)
        1,            # biPlanes
        32,           # biBitCount
        0,            # biCompression (BI_RGB)
        bmp_size,     # biSizeImage
        0, 0, 0, 0    # unused
    )

    # AND mask (1 bit per pixel, row-aligned to 4 bytes)
    and_row_bytes = ((size + 31) // 32) * 4
    and_mask = bytearray(and_row_bytes * size)

    # Total image data offset: header(6) + entry(16) = 22
    image_data = bih + pixels + and_mask
    image_size = len(image_data)

    # ICO header
    ico = bytearray()
    ico += struct.pack("<HHH", 0, 1, 1)  # reserved, ICO type, 1 image

    # Directory entry
    ico += struct.pack("<BBBBHHII",
        size,         # width (0 = 256)
        0,            # height (0 = 256 for 2x in ICO)
        0,            # color palette
        0,            # reserved
        1,            # color planes
        32,           # bits per pixel
        image_size,   # size of image data
        22,           # offset to image data (6 + 16)
    )

    ico += image_data

    with open(path, "wb") as f:
        f.write(bytes(ico))
    print(f"  Created {path} ({len(ico)} bytes)")


if __name__ == "__main__":
    generate_ico(os.path.join(ICONS_DIR, "icon.ico"), 32)
    print("Done. Run 'cargo clean && cargo build' to rebuild.")
