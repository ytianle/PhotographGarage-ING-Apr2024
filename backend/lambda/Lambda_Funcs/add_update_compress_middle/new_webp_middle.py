"""将 public 原图压缩为 public_middle 的 WebP，并保持目录结构。
Algorithm steps:
1) Read image, fix EXIF orientation.
2) If original <= target size: try lossless WebP; keep if still <= target.
3) If >25MB: resize to max_dim before lossy steps.
4) Lossy WebP quality ladder (step/limit) until <= target or min_quality.
5) If still > target: resize to max_dim (if larger), then repeat ladder.
6) If resized result < target * min_target_ratio: raise quality back up.
7) If already <= max_dim and still > target: continue down to fallback_min_quality.
"""
import io
import json
import os
from os.path import splitext
from urllib.parse import unquote_plus

import boto3
from PIL import Image, ImageOps, ImageSequence

s3 = boto3.client("s3")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff"}


def iter_s3_records(event):
    for record in event.get("Records", []):
        if "s3" in record:
            yield record
            continue
        sns = record.get("Sns")
        if not sns:
            continue
        try:
            message = json.loads(sns.get("Message", ""))
        except json.JSONDecodeError:
            continue
        for inner in message.get("Records", []):
            if "s3" in inner:
                yield inner


def lambda_handler(event, context):
    bucket_name = os.environ.get("BUCKET_NAME", "marcus-photograph-garage")
    source_prefix = os.environ.get("SOURCE_PREFIX", "public")
    destination_prefix = os.environ.get("DEST_PREFIX", "public_middle")

    target_size_kb = int(os.environ.get("TARGET_SIZE_KB", "1024"))
    quality = int(os.environ.get("WEBP_QUALITY", "86"))
    min_quality = int(os.environ.get("MIN_QUALITY", "60"))
    max_dim = int(os.environ.get("MAX_DIM", "3000"))
    min_target_ratio = float(os.environ.get("MIN_TARGET_RATIO", "0.6"))
    fallback_min_quality = int(os.environ.get("FALLBACK_MIN_QUALITY", "40"))
    large_image_mb = float(os.environ.get("LARGE_IMAGE_MB", "25"))
    quality_step = int(os.environ.get("QUALITY_STEP", "8"))
    max_quality_steps = int(os.environ.get("MAX_QUALITY_STEPS", "6"))

    for record in iter_s3_records(event):
        event_name = unquote_plus(record["eventName"])
        object_key = unquote_plus(record["s3"]["object"]["key"])

        if event_name.startswith("ObjectCreated:"):
            if object_key.endswith("/"):
                process_folder(
                    bucket_name,
                    object_key,
                    source_prefix,
                    destination_prefix,
                    target_size_kb,
                    quality,
                    min_quality,
                    max_dim,
                    min_target_ratio,
                    fallback_min_quality,
                    large_image_mb,
                    quality_step,
                    max_quality_steps,
                )
            else:
                process_object(
                    bucket_name,
                    object_key,
                    source_prefix,
                    destination_prefix,
                    target_size_kb,
                    quality,
                    min_quality,
                    max_dim,
                    min_target_ratio,
                    fallback_min_quality,
                    large_image_mb,
                    quality_step,
                    max_quality_steps,
                )
        elif event_name.startswith("ObjectRemoved:"):
            delete_destination(bucket_name, object_key, source_prefix, destination_prefix)

    return {
        "statusCode": 200,
        "body": json.dumps("Event processed successfully."),
    }


def process_folder(
    bucket,
    folder_key,
    source_prefix,
    destination_prefix,
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
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=folder_key):
        for item in page.get("Contents", []):
            process_object(
                bucket,
                item["Key"],
                source_prefix,
                destination_prefix,
                target_size_kb,
                quality,
                min_quality,
                max_dim,
                min_target_ratio,
                fallback_min_quality,
                large_image_mb,
                quality_step,
                max_quality_steps,
            )


def process_object(
    bucket,
    object_key,
    source_prefix,
    destination_prefix,
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
    if not object_key.startswith(f"{source_prefix}/"):
        return

    if not is_image_key(object_key):
        return

    destination_key = build_destination_key(
        object_key, source_prefix, destination_prefix
    )

    response = s3.get_object(Bucket=bucket, Key=object_key)
    image_content = response["Body"].read()

    compressed_content = compress_to_webp(
        image_content,
        target_size_kb=target_size_kb,
        quality=quality,
        min_quality=min_quality,
        max_dim=max_dim,
        min_target_ratio=min_target_ratio,
        fallback_min_quality=fallback_min_quality,
        large_image_mb=large_image_mb,
        quality_step=quality_step,
        max_quality_steps=max_quality_steps,
    )

    s3.put_object(
        Bucket=bucket,
        Key=destination_key,
        Body=compressed_content,
        ContentType="image/webp",
    )


def delete_destination(bucket, source_key, source_prefix, destination_prefix):
    destination_key = build_destination_key(source_key, source_prefix, destination_prefix)
    if source_key.endswith("/"):
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=destination_key):
            for item in page.get("Contents", []):
                s3.delete_object(Bucket=bucket, Key=item["Key"])
        return

    if is_image_key(source_key):
        s3.delete_object(Bucket=bucket, Key=destination_key)


def build_destination_key(source_key, source_prefix, destination_prefix):
    relative_key = source_key[len(source_prefix) :]
    destination_key = f"{destination_prefix}{relative_key}"
    base, _ = splitext(destination_key)
    return f"{base}.webp"


def is_image_key(key):
    _, ext = splitext(key)
    return ext.lower() in IMAGE_EXTENSIONS


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
