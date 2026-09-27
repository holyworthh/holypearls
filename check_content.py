import os
from PIL import Image

dir_path = r'C:\Users\ASUS\Desktop\design\holypeals-design'

# Let's inspect the dimensions and contents of each file
files = sorted([f for f in os.listdir(dir_path) if f.endswith('.png')])

print(f"Total files: {len(files)}")
# Let's check each domain's files and print visual characteristics
