#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
THEME_DIR="$SCRIPT_DIR/openant-source"
OUT="$SCRIPT_DIR/openant-source.zip"

cd "$THEME_DIR"
rm -f "$OUT"
zip -r "$OUT" . -x 'node_modules/*' '.git/*' 'gulpfile.js'
echo "Built $OUT"
