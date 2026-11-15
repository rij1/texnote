#!/usr/bin/env python3
import os
import math
from PIL import Image, ImageDraw

WEB_DIR = '/mnt/c/Users/user/Desktop/Latex/overleaf/services/web'
OL_BRAND_DIR = os.path.join(WEB_DIR, 'public/img/ol-brand')
BRAND_DIR = os.path.join(WEB_DIR, 'public/img/brand')
PUBLIC_DIR = os.path.join(WEB_DIR, 'public')
IMAGES_DIR = os.path.join(WEB_DIR, 'public/images')
SVGS_DIR = os.path.join(WEB_DIR, 'frontend/js/shared/svgs')

def get_texnote_mark_svg(mode="color"):
    """
    Generate TexNote Mark SVG.
    Dimensions: 136 x 157 (viewBox="0 0 136 157")
    """
    if mode == "color":
        defs = """
  <defs>
    <linearGradient id="tnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00d2ff" />
      <stop offset="50%" stop-color="#3a7bd5" />
      <stop offset="100%" stop-color="#6a11cb" />
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00d2ff" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#6a11cb" stop-opacity="0.08" />
    </linearGradient>
    <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="100%" stop-color="#4facfe" />
    </linearGradient>
  </defs>"""
        shield_fill = "url(#shieldGrad)"
        shield_stroke = "#00d2ff"
        main_fill = "url(#tnGrad)"
        accent_fill = "#00f2fe"
        orbit_stroke = "url(#orbitGrad)"
        dot_fill = "#00f2fe"
    elif mode == "grey":
        defs = ""
        shield_fill = "#334155"
        shield_stroke = "#475569"
        main_fill = "#64748b"
        accent_fill = "#94a3b8"
        orbit_stroke = "#475569"
        dot_fill = "#64748b"
    elif mode == "white":
        defs = ""
        shield_fill = "rgba(255,255,255,0.12)"
        shield_stroke = "#ffffff"
        main_fill = "#ffffff"
        accent_fill = "#e2e8f0"
        orbit_stroke = "#ffffff"
        dot_fill = "#ffffff"
    elif mode == "dark":
        defs = ""
        shield_fill = "rgba(15,23,42,0.06)"
        shield_stroke = "#1e293b"
        main_fill = "#0f172a"
        accent_fill = "#2563eb"
        orbit_stroke = "#2563eb"
        dot_fill = "#2563eb"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 136 157" width="136" height="157">
{defs}
  <!-- Rounded Note Document Shield -->
  <path d="M 28 20 C 28 12 34 6 42 6 L 94 6 C 102 6 108 12 108 20 L 108 106 C 108 112 104 118 98 122 L 71 149 C 69 151 67 151 65 149 L 38 122 C 32 118 28 112 28 106 Z" 
        fill="{shield_fill}" stroke="{shield_stroke}" stroke-width="2.5" stroke-linejoin="round" />
  
  <!-- 'T' Typeset Core -->
  <path d="M 38 32 C 38 27.5 41.5 24 46 24 L 90 24 C 94.5 24 98 27.5 98 32 L 98 44 C 98 48.5 94.5 52 90 52 L 75 52 L 75 106 C 75 110.5 71.5 114 67 114 L 69 114 C 64.5 114 61 110.5 61 106 L 61 52 L 46 52 C 41.5 52 38 48.5 38 44 Z" 
        fill="{main_fill}" />

  <!-- Note Fold Corner Accent -->
  <path d="M 74 24 L 98 48 L 74 48 Z" fill="{accent_fill}" opacity="{0.6 if mode == 'color' else 0.7}" />

  <!-- Cosmic Orbit Ring for IRSpace -->
  <ellipse cx="68" cy="78" rx="56" ry="22" transform="rotate(-26 68 78)"
           fill="none" stroke="{orbit_stroke}" stroke-width="4.5" stroke-dasharray="140 28" stroke-linecap="round" />
  
  <!-- Satellite Orbit Spark -->
  <circle cx="114" cy="54" r="5" fill="{dot_fill}" />
</svg>"""
    return svg

def get_texnote_horizontal_svg(theme="dark_bg"):
    """
    Horizontal Logo: TeXNote
    theme:
      - 'dark_bg': White text for dark navbar / header
      - 'light_bg': Slate text for light navbar / page
    """
    text_fill = "#ffffff" if theme == "dark_bg" else "#0f172a"
    
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 64" width="220" height="64">
  <defs>
    <linearGradient id="hGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00d2ff" />
      <stop offset="50%" stop-color="#3a7bd5" />
      <stop offset="100%" stop-color="#6a11cb" />
    </linearGradient>
    <linearGradient id="hOrbit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="100%" stop-color="#4facfe" />
    </linearGradient>
  </defs>

  <!-- Left Icon Mark -->
  <g transform="translate(4, 2) scale(0.36)">
    <path d="M 28 20 C 28 12 34 6 42 6 L 94 6 C 102 6 108 12 108 20 L 108 106 C 108 112 104 118 98 122 L 71 149 C 69 151 67 151 65 149 L 38 122 C 32 118 28 112 28 106 Z" 
          fill="rgba(0,210,255,0.16)" stroke="#00d2ff" stroke-width="4" stroke-linejoin="round" />
    <path d="M 38 32 C 38 27.5 41.5 24 46 24 L 90 24 C 94.5 24 98 27.5 98 32 L 98 44 C 98 48.5 94.5 52 90 52 L 75 52 L 75 106 C 75 110.5 71.5 114 67 114 C 62.5 114 59 110.5 59 106 L 59 52 L 46 52 C 41.5 52 38 48.5 38 44 Z" 
          fill="url(#hGrad)" />
    <path d="M 74 24 L 98 48 L 74 48 Z" fill="#00f2fe" opacity="0.6" />
    <ellipse cx="68" cy="78" rx="56" ry="22" transform="rotate(-26 68 78)"
             fill="none" stroke="url(#hOrbit)" stroke-width="6" stroke-dasharray="140 28" stroke-linecap="round" />
    <circle cx="114" cy="54" r="6" fill="#00f2fe" />
  </g>

  <!-- Typography: Bold Clean TeXNote -->
  <text x="64" y="43" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
        font-size="31" font-weight="800" fill="{text_fill}" letter-spacing="-0.5">TeX<tspan fill="url(#hGrad)">Note</tspan></text>
</svg>"""
    return svg

def generate_loading_gif(filepath, size=32, num_frames=30):
    """
    Generate an ultra-smooth, beautiful animated loading GIF.
    Theme: Glowing cosmic orbital spinner with glowing core for TexNote.
    """
    frames = []
    w, h = size, size
    cx, cy = w / 2, h / 2
    radius = (min(w, h) / 2) - 3.5

    for frame_idx in range(num_frames):
        angle_rad = (2 * math.pi * frame_idx) / num_frames
        
        # Transparent RGBA canvas
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(im)

        # Draw glowing arc trail
        num_trail = 18
        for i in range(num_trail):
            tail_angle = angle_rad - (i * 0.12)
            alpha = int(255 * (1.0 - (i / num_trail)))
            if alpha <= 0:
                continue
            
            # Color transition: Cyan (#00f2fe) to Blue (#3a7bd5) to Indigo
            r = int(0 + (106 * (i / num_trail)))
            g = int(210 - (100 * (i / num_trail)))
            b = int(255 - (40 * (i / num_trail)))
            
            dot_x = cx + radius * math.cos(tail_angle)
            dot_y = cy + radius * math.sin(tail_angle)
            dot_r = 2.2 * (1.0 - (i / (num_trail * 1.5)))
            
            draw.ellipse(
                [dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r],
                fill=(r, g, b, alpha)
            )

        # Draw central stylized 'T'
        t_color = (0, 210, 255, 230)
        # horizontal bar
        draw.line([cx - radius * 0.35, cy - radius * 0.3, cx + radius * 0.35, cy - radius * 0.3], fill=t_color, width=2)
        # vertical stem
        draw.line([cx, cy - radius * 0.3, cx, cy + radius * 0.4], fill=t_color, width=2)

        # Convert to P mode with transparency for clean GIF rendering
        alpha_mask = im.split()[3]
        im_p = im.convert('RGB').convert('P', palette=Image.ADAPTIVE, colors=64)
        # Set transparent color index
        mask = Image.eval(alpha_mask, lambda a: 255 if a < 128 else 0)
        im_p.paste(255, mask)
        im_p.info['transparency'] = 255
        frames.append(im_p)

    frames[0].save(
        filepath,
        save_all=True,
        append_images=frames[1:],
        duration=40,  # 40ms = 25 fps
        loop=0,
        transparency=255,
        disposal=2
    )
    print(f"Generated animated loading GIF at {filepath} ({size}x{size}, {num_frames} frames)")

# 1. Generate Mark SVGs
marks = {
    os.path.join(OL_BRAND_DIR, 'overleaf-o.svg'): 'color',
    os.path.join(OL_BRAND_DIR, 'overleaf-o-white.svg'): 'white',
    os.path.join(OL_BRAND_DIR, 'overleaf-o-dark.svg'): 'dark',
    os.path.join(OL_BRAND_DIR, 'overleaf-o-grey.svg'): 'grey',
    os.path.join(PUBLIC_DIR, 'overleaf-logo.svg'): 'color',
    os.path.join(SVGS_DIR, 'overleaf-logo.svg'): 'color',
}

for path, mode in marks.items():
    with open(path, 'w', encoding='utf-8') as f:
        f.write(get_texnote_mark_svg(mode))
    print(f"Saved mark SVG: {path} ({mode})")

# 2. Generate Horizontal Logo SVGs
horizontals = {
    os.path.join(OL_BRAND_DIR, 'overleaf.svg'): 'light_bg',
    os.path.join(OL_BRAND_DIR, 'overleaf-green.svg'): 'light_bg',
    os.path.join(OL_BRAND_DIR, 'overleaf-black.svg'): 'light_bg',
    os.path.join(OL_BRAND_DIR, 'overleaf-white.svg'): 'dark_bg',
    os.path.join(OL_BRAND_DIR, 'overleaf-a-ds-solution-mallard.svg'): 'light_bg',
    os.path.join(BRAND_DIR, 'logo-horizontal.svg'): 'light_bg',
    os.path.join(BRAND_DIR, 'logo-horizontal-white.svg'): 'dark_bg',
    os.path.join(SVGS_DIR, 'overleaf-green.svg'): 'light_bg',
    os.path.join(SVGS_DIR, 'overleaf-white.svg'): 'dark_bg',
    os.path.join(SVGS_DIR, 'overleaf-a-ds-solution-mallard.svg'): 'light_bg',
    os.path.join(SVGS_DIR, 'overleaf-a-ds-solution-mallard-dark.svg'): 'dark_bg',
}

for path, theme in horizontals.items():
    with open(path, 'w', encoding='utf-8') as f:
        f.write(get_texnote_horizontal_svg(theme))
    print(f"Saved horizontal SVG: {path} ({theme})")

# 3. Generate Favicon SVG
favicon_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="favBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="favGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00d2ff" />
      <stop offset="50%" stop-color="#3a7bd5" />
      <stop offset="100%" stop-color="#6a11cb" />
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#favBg)" />
  <g transform="translate(7, 3) scale(0.37)">
    <path d="M 28 20 C 28 12 34 6 42 6 L 94 6 C 102 6 108 12 108 20 L 108 106 C 108 112 104 118 98 122 L 71 149 C 69 151 67 151 65 149 L 38 122 C 32 118 28 112 28 106 Z" 
          fill="rgba(0,210,255,0.18)" stroke="#00d2ff" stroke-width="3" stroke-linejoin="round" />
    <path d="M 38 32 C 38 27.5 41.5 24 46 24 L 90 24 C 94.5 24 98 27.5 98 32 L 98 44 C 98 48.5 94.5 52 90 52 L 75 52 L 75 106 C 75 110.5 71.5 114 67 114 C 62.5 114 59 110.5 59 106 L 59 52 L 46 52 C 41.5 52 38 48.5 38 44 Z" 
          fill="url(#favGrad)" />
    <path d="M 74 24 L 98 48 L 74 48 Z" fill="#00f2fe" opacity="0.6" />
    <ellipse cx="68" cy="78" rx="56" ry="22" transform="rotate(-26 68 78)"
             fill="none" stroke="#00f2fe" stroke-width="5" stroke-dasharray="140 28" stroke-linecap="round" />
    <circle cx="114" cy="54" r="6" fill="#00f2fe" />
  </g>
</svg>"""

with open(os.path.join(PUBLIC_DIR, 'favicon.svg'), 'w', encoding='utf-8') as f:
    f.write(favicon_svg)
with open(os.path.join(PUBLIC_DIR, 'mask-favicon.svg'), 'w', encoding='utf-8') as f:
    f.write(favicon_svg)

# 4. Generate PNG and ICO assets using rsvg-convert & ImageMagick
os.system(f"rsvg-convert -w 32 -h 32 '{os.path.join(PUBLIC_DIR, 'favicon.svg')}' -o '{os.path.join(PUBLIC_DIR, 'favicon-32x32.png')}'")
os.system(f"rsvg-convert -w 16 -h 16 '{os.path.join(PUBLIC_DIR, 'favicon.svg')}' -o '{os.path.join(PUBLIC_DIR, 'favicon-16x16.png')}'")
os.system(f"magick '{os.path.join(PUBLIC_DIR, 'favicon-32x32.png')}' '{os.path.join(PUBLIC_DIR, 'favicon.ico')}'")
os.system(f"rsvg-convert -w 560 -h 128 '{os.path.join(OL_BRAND_DIR, 'overleaf.svg')}' -o '{os.path.join(OL_BRAND_DIR, 'logo-horizontal.png')}'")
os.system(f"rsvg-convert -w 400 -h 400 '{os.path.join(PUBLIC_DIR, 'favicon.svg')}' -o '{os.path.join(OL_BRAND_DIR, 'overleaf_og_logo.png')}'")
os.system(f"rsvg-convert -w 280 -h 64 '{os.path.join(OL_BRAND_DIR, 'overleaf.svg')}' -o '{os.path.join(OL_BRAND_DIR, 'email-logo@2x.png')}'")

# 5. Generate loading GIFs
gif_targets = [
    (os.path.join(IMAGES_DIR, 'loading-icon-ff2dfa442d903d9d5e30.gif'), 32),
    (os.path.join(IMAGES_DIR, 'pdfjs-dist/loading-icon.gif'), 32),
    (os.path.join(PUBLIC_DIR, 'loading-icon.gif'), 32),
    (os.path.join(PUBLIC_DIR, 'images/loading.gif'), 48),
]

for gif_path, sz in gif_targets:
    os.makedirs(os.path.dirname(gif_path), exist_ok=True)
    generate_loading_gif(gif_path, size=sz)

print("All TexNote (by IRSpace) branding assets successfully generated!")
