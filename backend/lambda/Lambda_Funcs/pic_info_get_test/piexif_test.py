import piexif

def get_exif_data(image_path):
    exif_dict = piexif.load(image_path)
    # 曝光时间
    exposure_time = exif_dict['Exif'].get(piexif.ExifIFD.ExposureTime, 'N/A')
    # 光圈值
    f_number = exif_dict['Exif'].get(piexif.ExifIFD.FNumber, 'N/A')
    # ISO速度
    iso_speed = exif_dict['Exif'].get(piexif.ExifIFD.ISOSpeedRatings, 'N/A')
    # 焦距
    focal_length = exif_dict['Exif'].get(piexif.ExifIFD.FocalLength, 'N/A')
    # 闪光灯模式
    flash = exif_dict['Exif'].get(piexif.ExifIFD.Flash, 'N/A')

    if exposure_time != 'N/A':
        exposure_time = f"{exposure_time[0]}/{exposure_time[1]}"
    if f_number != 'N/A':
        f_number = f"{f_number[0] / f_number[1]:.1f}"
    if focal_length != 'N/A':
        focal_length = f"{focal_length[0] / focal_length[1]} mm"

    print(f'Exposure Time: {exposure_time}')
    print(f'F Number (Aperture): {f_number}')
    print(f'ISO Speed: {iso_speed}')
    print(f'Focal Length: {focal_length}')
    print(f'Flash: {flash}')

    return {
        'Exposure Time': exposure_time,
        'F Number': f_number,
        'ISO Speed': iso_speed,
        'Focal Length': focal_length,
        'Flash': flash
    }

# 假设图片路径如下，你需要根据你的实际路径来修改它
image_path = r'c:\Users\yuant\Downloads\IMG_1741.JPG'
exif_data = get_exif_data(image_path)
