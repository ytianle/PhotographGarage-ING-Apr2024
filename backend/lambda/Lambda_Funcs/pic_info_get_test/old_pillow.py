import json
import boto3
import urllib.parse
from PIL import Image
import io

# 初始化 S3 客户端
s3 = boto3.client('s3')


def lambda_handler(event, context):
    query_params = event.get('queryStringParameters', {})
    photo_key = query_params.get('photoKey')

    if photo_key is None:
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Missing photoKey query parameter'})
        }

    bucket_name = 'marcus-photograph-garage'

    try:
        # 获取图片对象
        response = s3.get_object(Bucket=bucket_name, Key=photo_key)
        image_content = response['Body'].read()

        # 使用Pillow读取图片
        image = Image.open(io.BytesIO(image_content))

        # 获取EXIF信息
        exif_data = image.getexif()
        if not exif_data:
            print("No EXIF data found")
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'message': 'No EXIF data found'})
            }

        # 提取需要的EXIF信息，注意：EXIF信息中的键通常是整数ID，你需要参考EXIF标准来找到对应的信息
        exif_keys = {
            # Basic tags
            271: 'Make',  # 相机制造商
            272: 'Model',  # 相机型号
            274: 'Orientation',  # 图片方向
            282: 'XResolution',  # 图片水平分辨率
            283: 'YResolution',  # 图片垂直分辨率
            296: 'ResolutionUnit',  # 分辨率单位
            306: 'DateTime',  # 创建日期和时间
            315: 'Artist',  # 创建者
            531: 'YCbCrPositioning',  # 色彩定位
            33432: 'Copyright',  # 版权信息

            # EXIF tags
            33434: 'ExposureTime',  # 曝光时间
            33437: 'FNumber',  # F数（光圈值）
            34855: 'ISOSpeedRatings',  # ISO速度
            37377: 'ShutterSpeedValue',  # 快门速度
            37378: 'ApertureValue',  # 光圈值
            37380: 'ExposureBiasValue',  # 曝光补偿
            37381: 'MaxApertureValue',  # 最大光圈值
            37383: 'MeteringMode',  # 测光模式
            37384: 'LightSource',  # 光源
            37385: 'Flash',  # 闪光灯
            37386: 'FocalLength',  # 焦距
            37500: 'MakerNote',  # 制造商备注
            37510: 'UserComment',  # 用户注释

            # GPS tags (如果有GPS信息的话)
            34853: 'GPSInfo',  # GPS信息
        }
        image_info = {}
        for tag_id, tag_name in exif_keys.items():
            if tag_id in exif_data:
                value = exif_data[tag_id]
                # 处理可能的字节类型值
                if isinstance(value, bytes):
                    value = value.decode(errors="ignore")
                image_info[tag_name] = str(value)
        if not image_info:
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'message': 'No relevant EXIF data found'})
            }
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(image_info)
        }
    except Exception as e:
        print(e)
        # 在开发和测试阶段，可以打印异常信息来帮助调试
        # 生产环境中应考虑安全性，避免返回敏感信息
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Could not retrieve EXIF info. Please check the logs.'})
        }
