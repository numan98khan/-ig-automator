#!/bin/bash
# Simple icon generator using ImageMagick (if available) or creates placeholders

if command -v convert &> /dev/null; then
    echo "ImageMagick found, generating icons from SVG..."
    convert -background "#3b82f6" -resize 192x192 icon.svg icon-192.png
    convert -background "#3b82f6" -resize 512x512 icon.svg icon-512.png
    echo "Icons generated successfully!"
else
    echo "ImageMagick not found. Please generate icons manually."
    echo "See ICONS_README.md for instructions."
fi
