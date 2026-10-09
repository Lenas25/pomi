"""
Builds the app icons and the final mascot PNGs from the owner-provided masters in assets/source/.
Placeholders for the poses without final art come from scripts/generate-placeholder-assets.js.

Run: uv run --with pillow python3 scripts/generate-brand-assets.py
"""

from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "assets"
ICON_MASTER = ROOT / "source" / "pomi-app-icon-master.png"
MASCOT_MASTER = ROOT / "source" / "pomi-camina-master.png"

ICON = 1024
# Inner square of the master's rounded tile: the crop corners stay inside the sand tile, so the
# icon is full-bleed sand (the launcher applies its own mask).
ICON_CROP = (158, 160, 1100, 1102)
# Android adaptive icon: everything visible must sit inside the central 66 % circle.
SAFE_RADIUS = ICON * 0.66 / 2
SPLASH_HEIGHT_RATIO = 0.6
MASCOT_HEIGHTS = {"": 180, "@2x": 360, "@3x": 540}
NOTIFICATION = 96
NOTIFICATION_PADDING = 4
# Head (with the sweatband knot) of the master as an ellipse, in fractions of the mascot box.
HEAD_ELLIPSE = (0.0, 0.0, 0.86, 0.6)
# Face area: dark ink pixels in it (eyes, smile) are cut out of the notification silhouette.
FACE_BOX = (0.3, 0.27, 0.75, 0.47)
INK_MAX_LUMA = 90
ALPHA_SOLID = 128


def save(image: Image.Image, relative: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def centered(image: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(image, ((size - image.width) // 2, (size - image.height) // 2), image)
    return canvas


def scaled(image: Image.Image, factor: float) -> Image.Image:
    size = (max(1, round(image.width * factor)), max(1, round(image.height * factor)))
    return image.resize(size, Image.LANCZOS)


def largest_component(mask: Image.Image) -> Image.Image:
    """Keeps only the largest 4-connected solid region (drops the motion lines)."""
    width, height = mask.size
    solid = mask.load()
    seen = bytearray(width * height)
    best: list[int] = []
    for start in range(width * height):
        if seen[start] or solid[start % width, start // width] < ALPHA_SOLID:
            continue
        region = []
        queue = deque([start])
        seen[start] = 1
        while queue:
            index = queue.popleft()
            region.append(index)
            x, y = index % width, index // width
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    n = ny * width + nx
                    if not seen[n] and solid[nx, ny] >= ALPHA_SOLID:
                        seen[n] = 1
                        queue.append(n)
        if len(region) > len(best):
            best = region
    keep = Image.new("L", mask.size, 0)
    pixels = keep.load()
    for index in best:
        pixels[index % width, index // width] = 255
    return keep


def silhouette(alpha: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    body = largest_component(alpha)
    image = Image.new("RGBA", alpha.size, rgb + (0,))
    image.putalpha(body)
    return image.crop(body.getbbox())


def box(image: Image.Image, fractions: tuple[float, float, float, float]) -> tuple[int, ...]:
    w, h = image.size
    return tuple(round(f * (w if i % 2 == 0 else h)) for i, f in enumerate(fractions))


def head_mask(mascot: Image.Image) -> Image.Image:
    """Mascot alpha limited to the head ellipse, with the face ink cut out (eyes and smile)."""
    ellipse = Image.new("L", mascot.size, 0)
    ImageDraw.Draw(ellipse).ellipse(box(mascot, HEAD_ELLIPSE), fill=255)
    mask = ImageChops.multiply(mascot.split()[3], ellipse)
    luma = mascot.convert("L").load()
    pixels = mask.load()
    left, top, right, bottom = box(mascot, FACE_BOX)
    for y in range(top, bottom):
        for x in range(left, right):
            if luma[x, y] < INK_MAX_LUMA:
                pixels[x, y] = 0
    return mask


def fit_in_safe_circle(image: Image.Image) -> Image.Image:
    """Scales `image` so every visible pixel lies inside the adaptive-icon safe circle."""
    alpha = image.split()[3].load()
    cx, cy = image.width / 2, image.height / 2
    reach = max(
        ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
        for y in range(0, image.height, 2)
        for x in range(0, image.width, 2)
        if alpha[x, y] > 0
    )
    return centered(scaled(image, SAFE_RADIUS / reach * 0.98), ICON)


def pure_white(image: Image.Image) -> Image.Image:
    """Keeps only the alpha: resampling and pasting blend edge pixels towards black, but Android
    tints status bar icons from the alpha alone and expects every visible pixel to be white."""
    white = Image.new("RGBA", image.size, (255, 255, 255, 0))
    white.putalpha(image.split()[3])
    return white


def assert_pure_white(image: Image.Image) -> None:
    """Fails the run unless the image is RGBA, has transparent pixels and every visible one is #FFFFFF."""
    assert image.mode == "RGBA", f"notification icon must be RGBA, got {image.mode}"
    assert image.size == (NOTIFICATION, NOTIFICATION), f"unexpected size {image.size}"
    access = image.load()
    pixels = [access[x, y] for y in range(image.height) for x in range(image.width)]
    visible = [p for p in pixels if p[3] > 0]
    assert visible and len(visible) < len(pixels), "notification icon needs visible and transparent pixels"
    bad = [p for p in visible if p[:3] != (255, 255, 255)]
    assert not bad, f"{len(bad)} visible notification icon pixels are not white, e.g. {bad[0]}"


def main() -> None:
    icon = Image.open(ICON_MASTER).convert("RGB")
    save(icon.crop(ICON_CROP).resize((ICON, ICON), Image.LANCZOS), "icons/app-icon.png")

    mascot = Image.open(MASCOT_MASTER).convert("RGBA")
    mascot = mascot.crop(mascot.split()[3].getbbox())

    save(fit_in_safe_circle(mascot), "icons/adaptive-foreground.png")
    save(
        centered(scaled(mascot, ICON * SPLASH_HEIGHT_RATIO / mascot.height), ICON),
        "icons/splash-icon.png",
    )
    for suffix, height in MASCOT_HEIGHTS.items():
        save(centered(scaled(mascot, height / mascot.height), height), f"mascot/pomi-camina{suffix}.png")

    alpha = mascot.split()[3]
    save(fit_in_safe_circle(silhouette(alpha, (0, 0, 0))), "icons/adaptive-monochrome.png")

    white_head = silhouette(head_mask(mascot), (255, 255, 255))
    inner = NOTIFICATION - 2 * NOTIFICATION_PADDING
    factor = inner / max(white_head.width, white_head.height)
    notification = pure_white(centered(scaled(white_head, factor), NOTIFICATION))
    assert_pure_white(notification)
    save(notification, "icons/notification-icon.png")
    assert_pure_white(Image.open(ROOT / "icons" / "notification-icon.png"))


if __name__ == "__main__":
    main()
