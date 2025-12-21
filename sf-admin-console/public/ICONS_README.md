# PWA Icons Setup

## Required Icons

The PWA needs the following icon files in the `/public` directory:

- `icon-192.png` - 192x192 pixels
- `icon-512.png` - 512x512 pixels

## How to Generate Icons

### Option 1: Use the SVG template
1. Open `public/icon.svg` in a graphics editor (Figma, Illustrator, Inkscape)
2. Customize the design if needed
3. Export as PNG at:
   - 192x192 pixels → `icon-192.png`
   - 512x512 pixels → `icon-512.png`

### Option 2: Use online tools
1. Visit https://realfavicongenerator.net/
2. Upload your logo/icon
3. Download the PWA icon package
4. Copy `icon-192.png` and `icon-512.png` to `/public`

### Option 3: Command line (if you have ImageMagick)
```bash
# From SVG
convert -background none -resize 192x192 public/icon.svg public/icon-192.png
convert -background none -resize 512x512 public/icon.svg public/icon-512.png

# Or from PNG
convert your-logo.png -resize 192x192 public/icon-192.png
convert your-logo.png -resize 512x512 public/icon-512.png
```

## Icon Requirements

- Format: PNG
- Background: Can be solid color or transparent
- Purpose: Used when app is installed on mobile/desktop
- Design: Should represent your SendFx Admin brand

## Current Status

Placeholder icons have been created. Replace them with proper branded icons before production deployment.
