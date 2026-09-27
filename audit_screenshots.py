import os
from PIL import Image

dir_path = r'C:\Users\ASUS\Desktop\design\holypeals-design'
files = sorted([f for f in os.listdir(dir_path) if f.endswith('.png')])

html = ['<!DOCTYPE html><html><head><style>body{font-family:sans-serif;background:#1e293b;color:#f8fafc;padding:20px;} .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:20px;} .card{background:#0f172a;padding:12px;border-radius:8px;border:1px solid #334155;} img{width:100%;height:auto;border-radius:4px;border:1px solid #475569;} h4{margin:0 0 8px 0;word-break:break-all;font-size:12px;color:#38bdf8;} p{margin:4px 0;font-size:11px;color:#94a3b8;}</style></head><body><h1>HolyPearls Screenshot Audit Gallery</h1><div class="grid">']

for f in files:
    p = os.path.join(dir_path, f)
    size_kb = os.path.getsize(p) // 1024
    with Image.open(p) as img:
        w, h = img.size
    html.append(f'<div class="card"><h4>{f}</h4><p>{w}x{h} px | {size_kb} KB</p><img src="{f}"></div>')

html.append('</div></body></html>')

gallery_path = os.path.join(dir_path, 'audit_gallery.html')
with open(gallery_path, 'w', encoding='utf-8') as out:
    out.write('\n'.join(html))

print(f'Gallery written to {gallery_path} with {len(files)} screenshots.')
