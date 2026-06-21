from pathlib import Path
import struct

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE_ICON = ASSETS / "app-icon-source.png"
ASSETS.mkdir(exist_ok=True)


def center_square(source: Image.Image) -> Image.Image:
    width, height = source.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return source.crop((left, top, left + side, top + side))


def line_icon(size: int) -> Image.Image | None:
    if not SOURCE_ICON.exists():
        return None

    source = center_square(Image.open(SOURCE_ICON).convert("RGBA"))
    side = source.width

    # Keep only the dark mic/send strokes. The source background, circular base,
    # and enclosed white areas stay transparent for tray/menu use.
    grayscale = ImageOps.grayscale(source)
    alpha = grayscale.point(lambda value: max(0, min(255, int((178 - value) * 4.4))))
    alpha = alpha.filter(ImageFilter.GaussianBlur(max(1, side // 900)))

    stroke_layer = Image.new("RGBA", source.size, (42, 50, 62, 0))
    stroke_layer.putalpha(alpha)
    glyph = stroke_layer

    bbox = glyph.getchannel("A").getbbox()
    if not bbox:
        return None

    glyph = glyph.crop(bbox)
    output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target = int(size * 0.9)
    scale = target / max(glyph.width, glyph.height)
    glyph = glyph.resize((round(glyph.width * scale), round(glyph.height * scale)), Image.Resampling.LANCZOS)
    x = (size - glyph.width) // 2
    y = (size - glyph.height) // 2
    output.alpha_composite(glyph, (x, y))
    return output


def white_circle_icon(size: int) -> Image.Image | None:
    if not SOURCE_ICON.exists():
        return None

    source = center_square(Image.open(SOURCE_ICON).convert("RGBA"))
    side = source.width
    zoom = 1.18
    crop_side = int(side / zoom)
    left = (side - crop_side) // 2
    top = (side - crop_side) // 2
    source = source.crop((left, top, left + crop_side, top + crop_side))
    source = source.resize((size, size), Image.Resampling.LANCZOS)

    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    inset = max(1, int(size * 0.018))
    draw.ellipse((inset, inset, size - inset, size - inset), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(1, size // 512)))
    source.putalpha(mask)
    return source


def rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_icon(size: int, compact: bool = False) -> Image.Image:
    scale = size / 256
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Soft shadow kept inside the transparent canvas.
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    margin = int(23 * scale)
    rounded_rect(
        shadow_draw,
        (margin, margin, size - margin, size - margin),
        int(58 * scale),
        (72, 92, 112, 42),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(7 * scale)))
    canvas.alpha_composite(shadow)

    draw = ImageDraw.Draw(canvas)

    # White glass base.
    base = (int(18 * scale), int(16 * scale), size - int(18 * scale), size - int(18 * scale))
    rounded_rect(draw, base, int(60 * scale), (250, 253, 255, 246), (255, 255, 255, 255), max(1, int(4 * scale)))
    rounded_rect(draw, (int(25 * scale), int(23 * scale), size - int(25 * scale), size - int(25 * scale)), int(52 * scale), None, (201, 221, 233, 142), max(1, int(2 * scale)))

    stroke = (60, 72, 86, 255)
    accent = (42, 104, 154, 255)
    line = max(8, int(12 * scale))
    fine = max(5, int(8 * scale))

    if compact:
        mic_x = int(101 * scale)
        mic_top = int(56 * scale)
        mic_bottom = int(123 * scale)
        plane = [
            (int(96 * scale), int(154 * scale)),
            (int(187 * scale), int(126 * scale)),
            (int(139 * scale), int(192 * scale)),
        ]
    else:
        mic_x = int(101 * scale)
        mic_top = int(55 * scale)
        mic_bottom = int(126 * scale)
        plane = [
            (int(96 * scale), int(155 * scale)),
            (int(190 * scale), int(126 * scale)),
            (int(139 * scale), int(195 * scale)),
        ]

    # Microphone capsule.
    mic_w = int(36 * scale)
    rounded_rect(
        draw,
        (mic_x - mic_w // 2, mic_top, mic_x + mic_w // 2, mic_bottom),
        int(19 * scale),
        None,
        stroke,
        line,
    )

    # Microphone stand.
    arc_box = (mic_x - int(53 * scale), mic_top + int(32 * scale), mic_x + int(53 * scale), mic_bottom + int(45 * scale))
    draw.arc(arc_box, start=18, end=162, fill=stroke, width=line)
    draw.line((mic_x, mic_bottom + int(34 * scale), mic_x, mic_bottom + int(70 * scale)), fill=stroke, width=line)
    draw.line((mic_x - int(28 * scale), mic_bottom + int(70 * scale), mic_x + int(28 * scale), mic_bottom + int(70 * scale)), fill=stroke, width=line)

    # Send arrow, slightly overlapping the mic stand.
    fold = (int(137 * scale), int(154 * scale))
    draw.line(plane + [plane[0]], fill=accent, width=line, joint="curve")
    draw.line((plane[0][0], plane[0][1], fold[0], fold[1], plane[1][0], plane[1][1]), fill=accent, width=fine, joint="curve")
    draw.line((fold[0], fold[1], plane[2][0], plane[2][1]), fill=accent, width=fine)

    return canvas


def bmp_ico_image_data(image: Image.Image, size: int) -> bytes:
    icon = image.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
    header = struct.pack(
        "<IIIHHIIIIII",
        40,
        size,
        size * 2,
        1,
        32,
        0,
        size * size * 4,
        0,
        0,
        0,
        0,
    )

    pixels = bytearray()
    for y in range(size - 1, -1, -1):
        for x in range(size):
            red, green, blue, alpha = icon.getpixel((x, y))
            pixels.extend((blue, green, red, alpha))

    mask_stride = ((size + 31) // 32) * 4
    mask = bytearray(mask_stride * size)
    for y in range(size - 1, -1, -1):
        row = size - 1 - y
        for x in range(size):
            alpha = icon.getpixel((x, y))[3]
            if alpha < 16:
                mask[row * mask_stride + x // 8] |= 0x80 >> (x % 8)

    return header + bytes(pixels) + bytes(mask)


def save_bmp_ico(image: Image.Image, path: Path, sizes: list[tuple[int, int]]) -> None:
    entries = []
    data_parts = []
    offset = 6 + 16 * len(sizes)
    for width, height in sizes:
        if width != height:
            raise ValueError("ICO sizes must be square.")
        data = bmp_ico_image_data(image, width)
        entries.append((width, height, len(data), offset))
        data_parts.append(data)
        offset += len(data)

    output = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
    for width, height, data_size, data_offset in entries:
        output.extend(
            struct.pack(
                "<BBBBHHII",
                0 if width == 256 else width,
                0 if height == 256 else height,
                0,
                0,
                1,
                32,
                data_size,
                data_offset,
            )
        )

    for data in data_parts:
        output.extend(data)

    path.write_bytes(output)


def main() -> None:
    app_icon = line_icon(1024) or draw_icon(1024)
    tray_icon = line_icon(256) or draw_icon(256, compact=True)
    desktop_icon = white_circle_icon(1024) or draw_icon(1024)

    app_icon.save(ASSETS / "app-icon.png")
    tray_icon.save(ASSETS / "tray-icon.png")
    desktop_icon.save(ASSETS / "desktop-icon.png")

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    app_icon.save(ASSETS / "app-icon.ico", sizes=ico_sizes)
    save_bmp_ico(desktop_icon, ASSETS / "desktop-icon.ico", ico_sizes)
    tray_icon.save(ASSETS / "tray-icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == "__main__":
    main()
