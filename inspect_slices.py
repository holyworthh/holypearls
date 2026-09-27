import os
from PIL import Image

dir_path = r'C:\Users\ASUS\Desktop\design\holypeals-design'

def analyze_image(filename):
    p = os.path.join(dir_path, filename)
    im = Image.open(p)
    w, h = im.size
    # sample colors at various y levels
    # check top, middle, bottom
    top = im.crop((0, 0, w, min(h, 200)))
    mid = im.crop((0, h//2 - 100, w, h//2 + 100))
    bot = im.crop((0, max(0, h - 200), w, h))
    return w, h, os.path.getsize(p)

# Let's inspect bayo files
for i in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]:
    for suffix in ['', '-1']:
        fn = f'screenshot-bayomediaprints.com-{i}{suffix}.png'
        if os.path.exists(os.path.join(dir_path, fn)):
            w, h, sz = analyze_image(fn)
            print(f'{fn:40} | {w}x{h} | {sz//1024} KB')
