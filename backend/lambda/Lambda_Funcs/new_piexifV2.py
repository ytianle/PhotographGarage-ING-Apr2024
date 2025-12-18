import json
import boto3
import piexif
import io
from os.path import splitext
from urllib.parse import unquote_plus
from PIL import Image

s3 = boto3.client('s3')


def lambda_handler(event, context):
    bucket_name = 'marcus-photograph-garage'  # 您的S3桶名

    for record in event['Records']:
        eventName = unquote_plus(record['eventName'])
        photo_key = unquote_plus(record['s3']['object']['key'])  # 获取触发事件的图片路径
        
        if eventName.startswith('ObjectCreated:'):
            if photo_key.endswith('/'):  # 上传的是文件夹
                # 创建对应的文件夹在public_small中
                copy_folder_contents(bucket_name, photo_key, 'public', 'public_small')
            else:
                # 处理单个文件
                photo_name, photo_extension = splitext(photo_key.split('/')[-1])
                if photo_extension.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
                    create_info_file(bucket_name, photo_key, photo_key.replace('public', 'public_small'))
        elif eventName.startswith('ObjectRemoved:'):
            # 处理文件或文件夹的删除
            delete_folder_contents(bucket_name, photo_key)

    return {
        'statusCode': 200,
        'body': json.dumps('Event processed successfully.')
    }


def copy_folder_contents(bucket, folder_key, source_prefix, destination_prefix):
    """复制文件夹内容到新的目标文件夹"""
    # 列出文件夹内容
    response = s3.list_objects_v2(Bucket=bucket, Prefix=folder_key)
    for item in response.get('Contents', []):
        copy_source = {
            'Bucket': bucket,
            'Key': item['Key']
        }
        # 创建新键名以符合目标文件夹结构
        new_key = item['Key'].replace(source_prefix, destination_prefix)
        s3.copy_object(Bucket=bucket, CopySource=copy_source, Key=new_key)

        # 如果是图片，则需要额外处理（例如创建信息文件）
        if new_key.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.gif')):
            create_info_file(bucket, item['Key'], new_key)

def compress_image(image_content, target_size_kb=150, quality=75, min_quality=50):
    """
    Compress image size.
    :param image_content: Original image content
    :param target_size_kb: Target image size (KB)
    :param quality: Initial compression quality
    :return: Compressed image content
    """
    # Load the image using Pillow
    print("Start compression...")
    image = Image.open(io.BytesIO(image_content))
        
    # Check if the image has an alpha channel (RGBA) and convert it to RGB
    if image.mode == 'RGBA':
        image = image.convert('RGB')
        
    img_format = image.format  # Preserve original image format

    img_byte_arr = io.BytesIO()

    # Determine format for saving based on original format
    save_format = img_format if img_format in ['JPEG', 'PNG', 'GIF'] else 'JPEG'

    if save_format == 'JPEG':
        # Loop to adjust compression quality for JPEG images
        while img_byte_arr.tell() < target_size_kb * 1024 and quality >= min_quality:
            img_byte_arr = io.BytesIO()  # Reset byte stream
            image.save(img_byte_arr, format='JPEG', quality=quality)
            if img_byte_arr.tell() <= target_size_kb * 1024:
                break  # 如果达到目标大小，则停止压缩
            quality -= 5  # Decrease quality to further compress
    else:
        # For non-JPEG images, just save the image as is or consider other compression methods
        image.save(img_byte_arr, format=save_format)

    print("Compression complete.")
    return img_byte_arr.getvalue()
    
def create_info_file(bucket, source_key, destination_key):
    """
    为图片创建信息文件。
    :param bucket: S3桶的名称
    :param source_key: 图片在S3上的键值 键名
    :param destination_key: 信息文件在S3上的键值
    """
    # 提取文件名，不包括扩展名
    photo_name, photo_extension = splitext(destination_key.split('/')[-1])
    info_file_key = destination_key.replace(photo_extension, '_info.json')  # 信息文件的完整键名 使用.json扩展名

    # 获取源图片
    response = s3.get_object(Bucket=bucket, Key=source_key)
    image_content = response['Body'].read()
    
    # 尝试压缩图片
    compressed_content = compress_image(image_content)
    print(f"first path: {destination_key}")
    # 将压缩后的图片上传到S3
    s3.put_object(Bucket=bucket, Key=destination_key, Body=compressed_content, ContentType='image/jpeg')

    # 初始化为空的EXIF数据字典
    exif_data = {}
    # 只有当文件是JPEG格式时，才尝试读取EXIF信息
    if photo_extension.lower() in ['.jpg', '.jpeg']:
        try:
            exif_dict = piexif.load(image_content)
            if exif_dict and 'Exif' in exif_dict:
                exif_data = get_exif_data_from_dict(exif_dict)
        except ValueError as e:
            # 处理特定的错误，例如"embedded null byte"
            print(f"Error reading EXIF data: {e}")
    
    # 序列化为JSON
    info_content = json.dumps(exif_data, indent=4)
    print(f"second path: {info_file_key}")
    # 将信息文件上传到S3
    s3.put_object(Bucket=bucket, Key=info_file_key,
                  Body=info_content, ContentType='application/json')


def delete_folder_contents(bucket, folder_key):
    """删除目标文件夹或文件内容及其对应的压缩图和信息文件"""
    # 将源路径转换为目标路径 (从public到public_small)
    destination_key = folder_key.replace('public', 'public_small')

    # 检查是单个文件还是文件夹
    if folder_key.endswith('/'):  
        # 如果是文件夹, 列出并删除目标文件夹内容
        response = s3.list_objects_v2(Bucket=bucket, Prefix=destination_key)
        for item in response.get('Contents', []):
            s3.delete_object(Bucket=bucket, Key=item['Key'])
    else:  
        # 如果是单个文件, 删除对应的压缩图和信息文件
        # 删除压缩图
        s3.delete_object(Bucket=bucket, Key=destination_key)
        # 构建信息文件的键名并删除
        photo_name, _ = splitext(destination_key.split('/')[-1])
        info_file_key = f"{'/'.join(destination_key.split('/')[:-1])}/{photo_name}_info.json"
        s3.delete_object(Bucket=bucket, Key=info_file_key)


def get_exif_data_from_dict(exif_dict):
    """从piexif的EXIF字典中提取特定的EXIF数据,带单位或格式化。"""
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
        value = exif_dict['Exif'].get(
            getattr(piexif.ExifIFD, exif_field), 'N/A')
        if value != 'N/A':
            # 格式化和添加单位
            if exif_field == 'ExposureTime':
                # 分数形式展示曝光时间，若分母为1，表示为整数秒
                value = f"{value[0]}/{value[1]} sec" if value[1] != 1 else f"{value[0]} sec"
            elif exif_field == 'FNumber':
                # 光圈值FNumber以F值的形式显示
                f_number_value = value[0] / value[1]
                value = f"F/{f_number_value:.1f}"
            elif exif_field == 'FocalLength':
                # 焦距以mm为单位
                focal_length_value = value[0] / value[1]
                value = f"{focal_length_value} mm"
            elif exif_field == 'Flash':
                # 闪光灯状态，转换为更易理解的文本
                flash_status = {0: "No Flash", 1: "Fired",
                                5: "Fired, Return not detected", 7: "Fired, Return detected"}
                value = flash_status.get(value, "Unknown Flash status")
            else:
                value = str(value)

            exif_data[readable_name] = value

    return exif_data
