import os
from PIL import Image

dir_path = r'C:\Users\ASUS\Desktop\design\holypeals-design'

# Let's see what each screenshot looks like by extracting features
# Or let's inspect the files for each domain

def inspect_domain(prefix):
    files = sorted([f for f in os.listdir(dir_path) if prefix in f and f.endswith('.png')])
    print(f"\n=== Inspection for {prefix} ===")
    for f in files:
        p = os.path.join(dir_path, f)
        im = Image.open(p)
        print(f"{f}: {im.size}, {os.path.getsize(p)//1024}KB")

inspect_domain('bayomedia')
inspect_domain('thefactory')
inspect_domain('syndew')
inspect_domain('customink')
inspect_domain('printful')
inspect_domain('moo')
inspect_domain('stickermule')
inspect_domain('swag')
