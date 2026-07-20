from pathlib import Path

from PIL import Image


SOURCE = Path(r"C:\Users\xinj\AppData\Local\Temp\codex-clipboard-59bfddba-7c44-423d-931d-5aaaaed5f1f6.jpg")
OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "tiles"
OUTPUT_SIZE = (72, 104)


def save_tile(image: Image.Image, x: int, y: int, width: int, height: int, name: str) -> None:
    crop = image.crop((x, y, x + width, y + height))
    crop.resize(OUTPUT_SIZE, Image.Resampling.LANCZOS).save(OUTPUT / f"{name}.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as source:
        image = source.convert("RGB")
        for rank in range(1, 10):
            x = 60 + (rank - 1) * 74
            save_tile(image, x, 219, 72, 105, f"B{rank}")
            save_tile(image, x, 326, 72, 105, f"W{rank}")
            save_tile(image, x, 433, 72, 105, f"T{rank}")

        for column, name in enumerate(("H5", "H7", "H8", "H6", "H1", "H2", "H3", "H4")):
            save_tile(image, 60 + column * 84, 540, 82, 115, name)
        for column, name in enumerate(("E", "S", "X", "N", "Z", "F", "P")):
            save_tile(image, 60 + column * 84, 657, 82, 120, name)


if __name__ == "__main__":
    main()
