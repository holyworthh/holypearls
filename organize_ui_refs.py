import os
import shutil
from PIL import Image

design_dir = r'C:\Users\ASUS\Desktop\design\holypeals-design'
ref_dir = os.path.join(design_dir, 'references')

def process_and_copy(src_name, dest_subfolder, dest_filename, crop_box=None):
    src_path = os.path.join(design_dir, src_name)
    if not os.path.exists(src_path):
        print(f"Error: {src_path} does not exist!")
        return False
    dest_path = os.path.join(ref_dir, dest_subfolder, dest_filename)
    
    with Image.open(src_path) as im:
        if crop_box:
            # crop_box is (left, top, right, bottom)
            im = im.crop(crop_box)
        # convert to RGB if RGBA with no transparency or save directly
        im.save(dest_path, "PNG")
        print(f"Saved: references/{dest_subfolder}/{dest_filename} ({im.size[0]}x{im.size[1]})")
    return True

print("=== ORGANIZING UI SCREENSHOTS ===")

# 1. CATALOGUE
# Bayo Homepage/Search/Discovery: top 1000px of screenshot-bayomediaprints.com-1-2.png
process_and_copy('screenshot-bayomediaprints.com-1-2.png', 'catalogue', 'bayo-home-product-discovery.png', (0, 0, 945, 950))
# Bayo Catalogue Grid: product directory grid
process_and_copy('screenshot-bayomediaprints.com-2-2.png', 'catalogue', 'bayo-product-directory.png', (0, 0, 945, 1100))
# Printful Catalogue
process_and_copy('screenshot-printful.com-1.png', 'catalogue', 'printful-catalogue-discovery.png', (0, 0, 945, 950))

# 2. PRODUCTION
# The Factory Garment Manufacturing
process_and_copy('screenshot-thefactorynigeria.com-2.png', 'production', 'factory-garment-manufacturing.png', (0, 0, 945, 950))
# The Factory Production Process
process_and_copy('screenshot-thefactorynigeria.com-6.png', 'production', 'factory-production-process.png', (0, 0, 945, 950))

# 3. EMBROIDERY
# Syndew Luxury Craft
process_and_copy('screenshot-syndew.studio-1-1.png', 'embroidery', 'syndew-luxury-embroidery-craft.png', (0, 0, 945, 950))
# Syndew Services
process_and_copy('screenshot-syndew.studio-3.png', 'embroidery', 'syndew-embroidery-services.png', (0, 0, 945, 950))

# 4. CONFIGURATION
# Custom Ink Configurator
process_and_copy('screenshot-customink.com-1-1.png', 'configuration', 'customink-configurator.png', (0, 0, 945, 950))
# Printful Design Maker
process_and_copy('screenshot-help.printful.com-1.png', 'configuration', 'printful-design-maker.png', (0, 0, 945, 950))

# 5. PRODUCT PRESENTATION
# MOO PDP
process_and_copy('screenshot-moo.com-1.png', 'product-presentation', 'moo-business-card-pdp.png', (0, 0, 945, 950))
# MOO Materials & Finishes
process_and_copy('screenshot-moo.com-2.png', 'product-presentation', 'moo-material-finishes.png', (0, 0, 945, 950))

# 6. PROOFING
# Sticker Mule Order Flow
process_and_copy('screenshot-stickermule.com-1.png', 'proofing', 'stickermule-order-flow.png', (0, 0, 945, 950))
# Sticker Mule Proof Workflow
process_and_copy('screenshot-stickermule.com-2.png', 'proofing', 'stickermule-proof-flow.png', (0, 0, 945, 950))

# 7. B2B
# Custom Ink Group Order
process_and_copy('screenshot-customink.com-1-2.png', 'b2b', 'customink-group-order.png', (0, 0, 945, 950))
# Swag B2B Merch
process_and_copy('screenshot-swag.com-1.png', 'b2b', 'swag-b2b-merch.png', (0, 0, 945, 950))
# Swag Kitting & Boxes
process_and_copy('screenshot-swag.com-8.png', 'b2b', 'swag-kitting-boxes.png', (0, 0, 945, 950))

print("\nUI References organized successfully!")
