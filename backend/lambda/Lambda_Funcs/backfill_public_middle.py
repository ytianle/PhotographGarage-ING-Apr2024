"""本地回填 public 到 public_middle，输出 WebP 并保持目录结构。
Algorithm steps:
1) Read image, fix EXIF orientation.
2) If original <= target size: try lossless WebP; keep if still <= target.
3) If >25MB: resize to max_dim before lossy steps.
4) Lossy WebP quality ladder (step/limit) until <= target or min_quality.
5) If still > target: resize to max_dim (if larger), then repeat ladder.
6) If resized result < target * min_target_ratio: raise quality back up.
7) If already <= max_dim and still > target: continue down to fallback_min_quality.
"""
import argparse
import io
import os
from os.path import splitext

import boto3
from PIL import Image, ImageOps, ImageSequence

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff"}


def main():
    parser = argparse.ArgumentParser(
        description="Backfill public images into public_middle as WebP."
    )
    parser.add_argument("--bucket", default=os.environ.get("BUCKET_NAME"))
    parser.add_argument("--source-prefix", default="public")
    parser.add_argument("--dest-prefix", default="public_middle")
    parser.add_argument("--target-size-kb", type=int, default=1024)
    parser.add_argument("--quality", type=int, default=86)
    parser.add_argument("--min-quality", type=int, default=60)
    parser.add_argument("--max-dim", type=int, default=3000)
    parser.add_argument("--min-target-ratio", type=float, default=0.6)
    parser.add_argument("--fallback-min-quality", type=int, default=40)
    parser.add_argument("--large-image-mb", type=float, default=25)
    parser.add_argument("--quality-step", type=int, default=8)
    parser.add_argument("--max-quality-steps", type=int, default=6)

    args = parser.parse_args()

    if not args.bucket:
        raise SystemExit("Missing --bucket or BUCKET_NAME.")

    s3 = boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")

    image_keys = []
    for page in paginator.paginate(Bucket=args.bucket, Prefix=f"{args.source_prefix}/"):
        for item in page.get("Contents", []):
            key = item["Key"]
            if is_image_key(key):
                image_keys.append(key)

    total = len(image_keys)
    if total == 0:
        print("No images found under source prefix.")
        return

    for index, key in enumerate(image_keys, start=1):
        destination_key = build_destination_key(
            key, args.source_prefix, args.dest_prefix
        )

        response = s3.get_object(Bucket=args.bucket, Key=key)
        image_content = response["Body"].read()

        compressed_content = compress_to_webp(
            image_content,
            target_size_kb=args.target_size_kb,
            quality=args.quality,
            min_quality=args.min_quality,
            max_dim=args.max_dim,
            min_target_ratio=args.min_target_ratio,
            fallback_min_quality=args.fallback_min_quality,
            large_image_mb=args.large_image_mb,
            quality_step=args.quality_step,
            max_quality_steps=args.max_quality_steps,
        )

        s3.put_object(
            Bucket=args.bucket,
            Key=destination_key,
            Body=compressed_content,
            ContentType="image/webp",
        )

        print(f"[{index}/{total}] {key} -> {destination_key}")


def is_image_key(key):
    _, ext = splitext(key)
    return ext.lower() in IMAGE_EXTENSIONS


def build_destination_key(source_key, source_prefix, destination_prefix):
    relative_key = source_key[len(source_prefix) :]
    destination_key = f"{destination_prefix}{relative_key}"
    base, _ = splitext(destination_key)
    return f"{base}.webp"


def compress_to_webp(
    image_content,
    target_size_kb,
    quality,
    min_quality,
    max_dim,
    min_target_ratio,
    fallback_min_quality,
    large_image_mb,
    quality_step,
    max_quality_steps,
):
    image = Image.open(io.BytesIO(image_content))
    image = ImageOps.exif_transpose(image)

    if getattr(image, "is_animated", False):
        image = ImageSequence.Iterator(image).__next__()

    image = normalize_mode(image)
    if len(image_content) > large_image_mb * 1024 * 1024:
        image = ensure_max_dimension(image, max_dim)

    if len(image_content) <= target_size_kb * 1024:
        lossless = encode_webp(image, quality, lossless=True)
        if len(lossless) <= target_size_kb * 1024:
            return lossless

    start_quality = quality
    compressed = encode_webp(image, quality, lossless=False)
    steps = 0
    while (
        len(compressed) > target_size_kb * 1024
        and quality > min_quality
        and steps < max_quality_steps
    ):
        quality = max(min_quality, quality - quality_step)
        compressed = encode_webp(image, quality, lossless=False)
        steps += 1

    if len(compressed) > target_size_kb * 1024:
        resized = ensure_max_dimension(image, max_dim)
        if resized is not image:
            quality = max(quality, min_quality)
            compressed = encode_webp(resized, quality, lossless=False)
            steps = 0
            while (
                len(compressed) > target_size_kb * 1024
                and quality > min_quality
                and steps < max_quality_steps
            ):
                quality = max(min_quality, quality - quality_step)
                compressed = encode_webp(resized, quality, lossless=False)
                steps += 1

            min_target_bytes = int(target_size_kb * 1024 * min_target_ratio)
            steps = 0
            while len(compressed) < min_target_bytes and quality < start_quality:
                quality = min(start_quality, quality + quality_step)
                compressed = encode_webp(resized, quality, lossless=False)
                steps += 1
                if steps >= max_quality_steps:
                    break
        else:
            steps = 0
            while (
                len(compressed) > target_size_kb * 1024
                and quality > fallback_min_quality
                and steps < max_quality_steps
            ):
                quality = max(fallback_min_quality, quality - quality_step)
                compressed = encode_webp(image, quality, lossless=False)
                steps += 1

    return compressed


def ensure_max_dimension(image, max_dim):
    width, height = image.size
    if max(width, height) <= max_dim:
        return image

    if width >= height:
        new_width = max_dim
        new_height = int(height * (max_dim / width))
    else:
        new_height = max_dim
        new_width = int(width * (max_dim / height))

    return image.resize((new_width, new_height), Image.LANCZOS)


def normalize_mode(image):
    if image.mode in {"RGBA", "LA"}:
        return image.convert("RGBA")
    if image.mode != "RGB":
        return image.convert("RGB")
    return image


def encode_webp(image, quality, lossless):
    output = io.BytesIO()
    image.save(
        output,
        format="WEBP",
        quality=quality,
        method=6,
        lossless=lossless,
    )
    return output.getvalue()


if __name__ == "__main__":
    main()
