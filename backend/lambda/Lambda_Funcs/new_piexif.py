import json
import boto3
import piexif
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

    bucket_name = 'marcus-photograph-garage'  # 更改为你的S3桶名

    try:
        # 从S3获取图片
        response = s3.get_object(Bucket=bucket_name, Key=photo_key)
        image_content = response['Body'].read()

        # 使用piexif读取EXIF信息
        exif_dict = piexif.load(image_content)

        # 提取和转换EXIF信息
        exif_data = get_exif_data_from_dict(exif_dict)

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(exif_data)
        }
    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Could not retrieve EXIF info. Please check the logs.'})
        }

def get_exif_data_from_dict(exif_dict):
    """从piexif的EXIF字典中提取特定的EXIF数据。"""
    # 定义想要提取的EXIF数据字段
    fields = {
        'ExposureTime': 'Exposure Time',
        'FNumber': 'F Number',
        'ISOSpeedRatings': 'ISO Speed',
        'FocalLength': 'Focal Length',
        'Flash': 'Flash'
    }

    exif_data = {}
    for exif_field, readable_name in fields.items():
        value = exif_dict['Exif'].get(getattr(piexif.ExifIFD, exif_field), 'N/A')
        if value != 'N/A':
            if isinstance(value, tuple):  # 对于分数类型的处理
                value = f"{value[0]}/{value[1]}"
            exif_data[readable_name] = value

    return exif_data
