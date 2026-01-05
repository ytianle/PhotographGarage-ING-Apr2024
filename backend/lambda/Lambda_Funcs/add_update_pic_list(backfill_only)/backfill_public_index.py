"""一次性生成 public_index.json（public 下图片列表）"""
import argparse
import json

import boto3

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif"}
INDEX_KEY = "public_small/photo_list_tracker.json"


def main():
  parser = argparse.ArgumentParser(description="Backfill public_index.json from S3.")
  parser.add_argument("--bucket", required=True)
  parser.add_argument("--prefix", default="public/")
  args = parser.parse_args()

  s3 = boto3.client("s3")
  paginator = s3.get_paginator("list_objects_v2")
  urls = []

  for page in paginator.paginate(Bucket=args.bucket, Prefix=args.prefix):
    for item in page.get("Contents", []):
      key = item["Key"]
      if is_image_key(key):
        urls.append(f"https://{args.bucket}.s3.amazonaws.com/{key}")

  urls.sort()
  s3.put_object(
    Bucket=args.bucket,
    Key=INDEX_KEY,
    Body=json.dumps(urls),
    ContentType="application/json",
  )
  print(f"Wrote {len(urls)} items to s3://{args.bucket}/{INDEX_KEY}")


def is_image_key(key):
  _, ext = key.rsplit(".", 1) if "." in key else ("", "")
  return f".{ext.lower()}" in IMAGE_EXTENSIONS


if __name__ == "__main__":
  main()
