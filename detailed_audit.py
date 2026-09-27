import os
from PIL import Image, ImageStat

dir_path = r'C:\Users\ASUS\Desktop\design\holypeals-design'

# Let's inspect the files and see what they correspond to:
categories = {
    'Bayo Media': [f for f in os.listdir(dir_path) if 'bayomedia' in f and f.endswith('.png')],
    'The Factory': [f for f in os.listdir(dir_path) if 'thefactory' in f and f.endswith('.png')],
    'Syndew': [f for f in os.listdir(dir_path) if 'syndew' in f and f.endswith('.png')],
    'Custom Ink': [f for f in os.listdir(dir_path) if 'customink' in f and f.endswith('.png')],
    'Printful': [f for f in os.listdir(dir_path) if ('printful.com' in f or 'help.printful' in f) and f.endswith('.png')],
    'MOO': [f for f in os.listdir(dir_path) if 'moo.com' in f and f.endswith('.png')],
    'Sticker Mule': [f for f in os.listdir(dir_path) if 'stickermule' in f and f.endswith('.png')],
    'Swag': [f for f in os.listdir(dir_path) if 'swag.com' in f and f.endswith('.png')],
}

for cat, files in categories.items():
    print(f"\n==================== {cat} ({len(files)} files) ====================")
    for f in sorted(files):
        p = os.path.join(dir_path, f)
        sz = os.path.getsize(p)
        with Image.open(p) as img:
            w, h = img.size
            stat = ImageStat.Stat(img)
            std = sum(stat.stddev) / len(stat.stddev)
            mean = sum(stat.mean) / len(stat.mean)
            
            # Simple heuristic
            is_blank = std < 8 or h < 100
            print(f"  {f:38} | {w}x{h} | {sz//1024:4}KB | std:{std:4.1f} | {'BLANK/UNUSABLE' if is_blank else 'CONTENT'}")
