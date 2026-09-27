import os
import urllib.request
from PIL import Image

photo_dir = r'C:\Users\ASUS\Desktop\design\holypeals-design\references\photography'
os.makedirs(photo_dir, exist_ok=True)

photo_manifest = [
    # H1: PRODUCT PHOTOGRAPHY
    ('h1-product-polo.jpg', 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&q=80', 'Clean studio polo shirt product photography'),
    ('h1-product-tote-bag.jpg', 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80', 'Custom printed tote bag studio product presentation'),
    ('h1-product-packaging.jpg', 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=800&q=80', 'Premium luxury retail paper bag & packaging'),
    ('h1-product-cards.jpg', 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80', 'Minimalist tactile business card studio photography'),
    ('h1-product-uniform.jpg', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&q=80', 'Tailored workwear apparel & garment silhouette'),
    ('h1-product-merchandise.jpg', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80', 'Corporate branded ceramic merchandise & drinkware'),

    # H2: PRODUCTION / PROCESS
    ('h2-process-cutting.jpg', 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&q=80', 'Garment pattern cutting table in textile workshop'),
    ('h2-process-sewing.jpg', 'https://images.unsplash.com/photo-1584184924103-e310d9dc82fc?w=800&q=80', 'Hands operating industrial sewing machine on fabric'),
    ('h2-process-embroidery-machine.jpg', 'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=800&q=80', 'Industrial embroidery machine needle & spools of thread'),
    ('h2-process-screenprint.jpg', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&q=80', 'Screen printing squeegee pulling ink across stencil'),
    ('h2-process-printing-press.jpg', 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80', 'Commercial offset printing press cylinder in operation'),
    ('h2-process-qc-packing.jpg', 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80', 'Garment quality inspection, finishing & warehouse packing'),

    # H3: FINISHED WORK IN CONTEXT
    ('h3-context-corporate-team.jpg', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80', 'African corporate professional team in coordinated workwear'),
    ('h3-context-hospitality-crew.jpg', 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80', 'Hospitality culinary staff wearing custom branded uniforms'),
    ('h3-context-event-staff.jpg', 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&q=80', 'Conference crew & coordinators wearing branded event shirts'),
    ('h3-context-school-uniform.jpg', 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&q=80', 'Students in structured school uniform blazer and knitwear'),
    ('h3-context-retail-branding.jpg', 'https://images.unsplash.com/photo-1555529771-7888783a18d3?w=800&q=80', 'Physical retail storefront branding and custom branded signage'),
    ('h3-context-creative-team.jpg', 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80', 'Diverse team in branded casual workwear collaborating'),

    # H4: MATERIAL MACRO
    ('h4-macro-embroidery-stitch.jpg', 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&q=80', 'Macro stitch detail showing dense embroidery thread sheen'),
    ('h4-macro-pique-cotton.jpg', 'https://images.unsplash.com/photo-1584589167171-541ce45f1eea?w=800&q=80', 'Close-up texture of heavyweight pique cotton weave'),
    ('h4-macro-screenprint-ink.jpg', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80', 'Tactile ink layer settling into organic textile fibers'),
    ('h4-macro-paper-foil.jpg', 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800&q=80', 'Heavyweight uncoated paper stock with embossed foil grain'),
    ('h4-macro-woven-label.jpg', 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&q=80', 'Damask woven fabric brand label with micro edge stitching'),
    ('h4-macro-packaging-grain.jpg', 'https://images.unsplash.com/photo-1607344645866-009c320b5ab8?w=800&q=80', 'Matte rigid box lamination texture with crisp fold edge')
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

print(f"Downloading {len(photo_manifest)} photography references...")
for fname, url, desc in photo_manifest:
    fpath = os.path.join(photo_dir, fname)
    png_path = os.path.join(photo_dir, fname.replace('.jpg', '.png'))
    if not os.path.exists(png_path):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp, open(fpath, 'wb') as f:
                f.write(resp.read())
            with Image.open(fpath) as img:
                img = img.convert('RGB')
                img.thumbnail((800, 600))
                img.save(png_path, 'PNG')
            if os.path.exists(fpath):
                os.remove(fpath)
            print(f"[OK] Saved {fname} -> {desc}")
        except Exception as e:
            print(f"[FAIL] {fname}: {e}")
    else:
        print(f"[EXISTS] {fname}")

print("\nPhotography manifest complete!")
