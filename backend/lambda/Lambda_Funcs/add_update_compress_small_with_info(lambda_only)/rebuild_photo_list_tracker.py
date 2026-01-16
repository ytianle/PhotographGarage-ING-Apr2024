# usage: python rebuild_photo_list_tracker.py --bucket marcus-photograph-garage
# this is a back fill for local aws cli usage
# for rebuilding public_small/photo_list_tracker.json from public/ images

import argparse
import json
import os
from os.path import splitext

import boto3


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif"}
DEFAULT_INDEX_KEY = "public_small/photo_list_tracker.json"


def is_image_key(key):
    _, ext = splitext(key)
    return ext.lower() in IMAGE_EXTENSIONS


def main():
    parser = argparse.ArgumentParser(
        description="Rebuild public_small photo_list_tracker.json from public/ objects."
    )
    parser.add_argument("--bucket", default=os.environ.get("BUCKET_NAME"))
    parser.add_argument("--source-prefix", default="public")
    parser.add_argument("--index-key", default=DEFAULT_INDEX_KEY)
    args = parser.parse_args()

    if not args.bucket:
        raise SystemExit("Missing --bucket or BUCKET_NAME.")

    s3 = boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")

    keys = []
    prefix = f"{args.source_prefix}/"
    for page in paginator.paginate(Bucket=args.bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item["Key"]
            if is_image_key(key):
                keys.append(key)

    base_url = f"https://{args.bucket}.s3.amazonaws.com/"
    urls = [f"{base_url}{key}" for key in keys]

    s3.put_object(
        Bucket=args.bucket,
        Key=args.index_key,
        Body=json.dumps(sorted(urls)),
        ContentType="application/json",
    )

    print(f"Wrote {len(urls)} URLs to s3://{args.bucket}/{args.index_key}")


if __name__ == "__main__":
    main()
