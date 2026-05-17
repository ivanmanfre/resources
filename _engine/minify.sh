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

# Architecture engine
cp architecture.js .architecture.js.bak
cp architecture.css .architecture.css.bak
npx -y terser .architecture.js.bak -c -m -o architecture.js
npx -y lightningcss-cli --minify -o architecture.css .architecture.css.bak
node -c architecture.js
rm .architecture.js.bak .architecture.css.bak
echo "Architecture minified. JS: $(wc -c < architecture.js) bytes, CSS: $(wc -c < architecture.css) bytes"

# AI Walkthrough engine
cp ai-walkthrough.js .ai-walkthrough.js.bak
cp ai-walkthrough.css .ai-walkthrough.css.bak
npx -y terser .ai-walkthrough.js.bak -c -m -o ai-walkthrough.js
npx -y lightningcss-cli --minify -o ai-walkthrough.css .ai-walkthrough.css.bak
node -c ai-walkthrough.js
rm .ai-walkthrough.js.bak .ai-walkthrough.css.bak
echo "AI Walkthrough minified. JS: $(wc -c < ai-walkthrough.js) bytes, CSS: $(wc -c < ai-walkthrough.css) bytes"
