#!/bin/bash
# One-shot minification for the LM engine. Run from this dir.
# Usage: ./minify.sh
set -e
cd "$(dirname "$0")"

# Backup before minifying (in case of bug)
cp assessment.js .assessment.js.bak
cp assessment.css .assessment.css.bak

# JS via terser
npx -y terser .assessment.js.bak -c -m -o assessment.js

# CSS via lightningcss
npx -y lightningcss-cli --minify -o assessment.css .assessment.css.bak

# Verify JS still parses
node -c assessment.js

# Cleanup backups
rm .assessment.js.bak .assessment.css.bak

echo "Minified. JS: $(wc -c < assessment.js) bytes, CSS: $(wc -c < assessment.css) bytes"
