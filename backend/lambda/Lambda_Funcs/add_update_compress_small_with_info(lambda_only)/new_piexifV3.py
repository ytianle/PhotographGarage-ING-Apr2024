import json
import boto3
import piexif
import io
import tempfile
import os
from os.path import splitext
from urllib.parse import unquote_plus
from PIL import Image

s3 = boto3.client('s3')
INDEX_KEY = "public_small/photo_list_tracker.json"
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.gif'}


def lambda_handler(event, context):
    bucket_name = 'marcus-photograph-garage'  # 您的S3桶名

    for record in event['Records']:
        eventName = unquote_plus(record['eventName'])
        photo_key = unquote_plus(record['s3']['object']['key'])  # 获取触发事件的图片路径
        if not photo_key.startswith('public/'):
            continue
        
        if eventName.startswith('ObjectCreated:'):
            if photo_key.endswith('/'):  # 上传的是文件夹
                # 创建对应的文件夹在public_small中
                copy_folder_contents(bucket_name, photo_key, 'public', 'public_small')
                update_index_for_prefix(bucket_name, photo_key)
            else:
                # 处理单个文件
                photo_name, photo_extension = splitext(photo_key.split('/')[-1])
                if photo_extension.lower() in IMAGE_EXTENSIONS:
                    print("creating info file for:", photo_key)
                    create_info_file(bucket_name, photo_key, photo_key.replace('public', 'public_small'))
                    update_index_for_key(bucket_name, photo_key)
        elif eventName.startswith('ObjectRemoved:'):
            # 处理文件或文件夹的删除
            delete_folder_contents(bucket_name, photo_key)
            if photo_key.endswith('/'):
                update_index_for_prefix(bucket_name, photo_key, remove=True)
            else:
                update_index_for_key(bucket_name, photo_key, remove=True)

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
        if new_key.lower().endswith(tuple(IMAGE_EXTENSIONS)):
            create_info_file(bucket, item['Key'], new_key)


def update_index_for_prefix(bucket, prefix, remove=False):
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    keys = [item['Key'] for item in response.get('Contents', [])]
    image_keys = [key for key in keys if is_image_key(key)]
    if image_keys:
        update_index(bucket, image_keys, remove=remove)


def update_index_for_key(bucket, key, remove=False):
    if not is_image_key(key):
        return
    update_index(bucket, [key], remove=remove)


def update_index(bucket, keys, remove=False):
    existing = load_index(bucket)
    updated = set(existing)
    base_url = f"https://{bucket}.s3.amazonaws.com/"
    urls = [f"{base_url}{key}" for key in keys]
    if remove:
        for url in urls:
            updated.discard(url)
    else:
        for url in urls:
            updated.add(url)
    save_index(bucket, sorted(updated))


def load_index(bucket):
    try:
        response = s3.get_object(Bucket=bucket, Key=INDEX_KEY)
        content = response['Body'].read()
        data = json.loads(content)
        return data if isinstance(data, list) else []
    except s3.exceptions.NoSuchKey:
        return []
    except Exception:
        return []


def save_index(bucket, data):
    s3.put_object(
        Bucket=bucket,
        Key=INDEX_KEY,
        Body=json.dumps(data),
        ContentType='application/json'
    )


def is_image_key(key):
    _, ext = splitext(key)
    return ext.lower() in IMAGE_EXTENSIONS


def compress_image_to_target(image_content, target_size_kb=100, max_iterations=10):
    """
    Compress an image to a target size using binary search for quality.
    """
    # Load the image
    image = Image.open(io.BytesIO(image_content))
    print("Image loaded, initial format and mode: {}, {}".format(image.format, image.mode))

    # Convert RGBA to RGB if necessary
    if image.mode == 'RGBA':
        image = image.convert('RGB')
        print("Converted RGBA to RGB.")

    # Estimate the initial scale factor based on current size and target size
    initial_size_kb = len(image_content) / 1024
    scale_factor = (target_size_kb / initial_size_kb) ** 0.5  # Square root to adjust both dimensions

    # Use a continuous function to ensure scale factor is sensible
    scale_factor = max(0.1, min(scale_factor, 1))  # No enlarging, and minimum reduction to 10%

    # Apply scaling
    new_width = int(image.width * scale_factor)
    new_height = int(image.height * scale_factor)
    image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    print("Resized image size (width x height):", image.size)

    # Initialize binary search parameters
    low, high = 10, 50  # Range of quality
    best_bytes = None

    # Start binary search
    iteration = 0
    while low <= high and iteration < max_iterations:
        mid = (low + high) // 2
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=mid)
        size_kb = len(img_byte_arr.getvalue()) / 1024

        # Logging the current state
        print("Iteration {}: Quality set to {}, resulting size: {:.2f} KB".format(iteration, mid, size_kb))

        if size_kb < target_size_kb:
            low = mid + 1
            best_bytes = img_byte_arr.getvalue()
            print("Size under target, adjusting quality up.")
        elif size_kb > target_size_kb:
            high = mid - 1
            print("Size over target, adjusting quality down.")
        else:
            print("Target size achieved exactly.")
            return img_byte_arr.getvalue()

        iteration += 1

    if best_bytes:
        print("Returning best attempt under target size.")
    else:
        print("No valid compression found, returning last attempt.")
    return best_bytes if best_bytes else img_byte_arr.getvalue()
#legacy    
def compress_image(image_content, target_size_kb=100, initial_quality=30):
    """
    Compress an image size by reducing resolution and quality.
    :param image_content: Original image content as bytes.
    :param target_size_kb: Target image size in KB.
    :param initial_quality: Initial compression quality.
    :return: Compressed image content as bytes.
    """
    image = Image.open(io.BytesIO(image_content))
    
    # Step 1: Reduce resolution
    # Calculate a scaling factor; this is a starting point and might need adjustment
    scaling_factor = (target_size_kb / (len(image_content) / 1024)) ** 0.5
    new_width = int(image.width * scaling_factor)
    new_height = int(image.height * scaling_factor)
    image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Step 2: Adjust compression quality
    # Loop to further reduce size by adjusting quality
    img_byte_arr = io.BytesIO()
    quality = initial_quality
    while quality > 10:  # Prevent quality from going too low
        img_byte_arr = io.BytesIO()  # Reset byte stream for each iteration
        image.save(img_byte_arr, format='JPEG', quality=quality)
        if img_byte_arr.tell() <= target_size_kb * 1024:
            break  # Stop if target size is reached
        quality -= 5  # Decrease quality to further compress
        
    return img_byte_arr.getvalue()
#legacy    
def compress_image_old(image_content, target_size_kb=100, quality=80, min_quality=20):
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
        while quality >= min_quality:
            img_byte_arr = io.BytesIO()  # Reset byte stream for each iteration
            image.save(img_byte_arr, format=save_format, quality=quality)
            if img_byte_arr.tell() <= target_size_kb * 1024:
                break  # If target size is achieved or under, stop compression
            quality -= 10  # Decrease quality to further compress
        
        if quality < min_quality:
            # If we've fallen below the min quality, log it
            print("Warning: Minimum quality reached, but target size not achieved.")
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
        
    # 将图像内容保存到临时文件
    with tempfile.NamedTemporaryFile(delete=False) as temp_image:
        temp_image.write(image_content)
        temp_image_path = temp_image.name
        
    #=========================EXIF info===========================
    # 初始化为空的EXIF数据字典
    exif_data = {}
    # 只有当文件是JPEG格式时，才尝试读取EXIF信息
    if photo_extension.lower() in ['.jpg', '.jpeg']:
        try:
            print("image path for exif: ", temp_image_path)
            exif_dict = piexif.load(temp_image_path)
            if exif_dict and 'Exif' in exif_dict:
                exif_data = get_exif_data_from_dict(exif_dict)
        except ValueError as e:
            # 处理特定的错误，例如"embedded null byte"
            print(f"Error reading EXIF data: {e}")
    
    # 删除临时文件
    os.unlink(temp_image_path)
    
    # 序列化为JSON
    info_content = json.dumps(exif_data, indent=4)
    print(f"FIRST INFO path: {info_file_key}")
    # 将信息文件上传到S3
    s3.put_object(Bucket=bucket, Key=info_file_key,
                  Body=info_content, ContentType='application/json')
                  
    #=========================Image compression===========================
    
    # 尝试压缩图片
    compressed_content = compress_image_to_target(image_content)
    print(f"SECOND COMPRESSION path: {destination_key}")
    # 将压缩后的图片上传到S3
    s3.put_object(Bucket=bucket, Key=destination_key, Body=compressed_content, ContentType='image/jpeg')



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
