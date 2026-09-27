import os
from PIL import Image

design_dir = r'C:\Users\ASUS\Desktop\design\holypeals-design'
ref_dir = os.path.join(design_dir, 'references')

def inspect_img(name):
    p = os.path.join(design_dir, name)
    if os.path.exists(p):
        im = Image.open(p)
        print(f"{name:40} | size: {im.size} | mode: {im.mode}")
        return im
    else:
        print(f"NOT FOUND: {name}")
        return None

print("=== BAYO ===")
inspect_img('screenshot-bayomediaprints.com-1-2.png')
inspect_img('screenshot-bayomediaprints.com-2-2.png')

print("=== THE FACTORY ===")
inspect_img('screenshot-thefactorynigeria.com-1.png')
inspect_img('screenshot-thefactorynigeria.com-2.png')
inspect_img('screenshot-thefactorynigeria.com-3.png')
inspect_img('screenshot-thefactorynigeria.com-6.png')

print("=== SYNDEW ===")
inspect_img('screenshot-syndew.studio-1-1.png')
inspect_img('screenshot-syndew.studio-3.png')
inspect_img('screenshot-syndew.studio-4.png')

print("=== CUSTOM INK ===")
inspect_img('screenshot-customink.com-1-1.png')
inspect_img('screenshot-customink.com-1-2.png')
inspect_img('screenshot-customink.com-2-2.png')

print("=== PRINTFUL ===")
inspect_img('screenshot-printful.com-1.png')
inspect_img('screenshot-printful.com-3.png')
inspect_img('screenshot-help.printful.com-1.png')

print("=== MOO ===")
inspect_img('screenshot-moo.com-1.png')
inspect_img('screenshot-moo.com-2.png')
inspect_img('screenshot-moo.com-3.png')

print("=== STICKER MULE ===")
inspect_img('screenshot-stickermule.com-1.png')
inspect_img('screenshot-stickermule.com-2.png')

print("=== SWAG ===")
inspect_img('screenshot-swag.com-1.png')
inspect_img('screenshot-swag.com-8.png')
