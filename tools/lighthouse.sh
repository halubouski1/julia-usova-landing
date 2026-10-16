#!/bin/sh
# Run Lighthouse (headless Chrome) against the local site and save
# lighthouse/lighthouse-<name>.json + .html.
#
#   npm run lh -- <name> [mobile|desktop]     e.g. npm run lh -- before
#
# Starts `python3 -m http.server 8765` if nothing is listening on the port,
# and stops it again afterwards. Lighthouse is the project-local devDependency.
set -eu

NAME="${1:-run}"
FORM="${2:-mobile}"
PORT=8765
URL="http://localhost:${PORT}/index.html"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/lighthouse"
mkdir -p "$OUT"

STARTED=""
if ! curl -s -o /dev/null "http://localhost:${PORT}/"; then
  (cd "$ROOT" && python3 -m http.server "$PORT" >/dev/null 2>&1 &)
  STARTED=1
  i=0
  until curl -s -o /dev/null "http://localhost:${PORT}/"; do
    i=$((i + 1)); [ "$i" -gt 50 ] && { echo "server did not start" >&2; exit 1; }
    sleep 0.1
  done
fi

PRESET=""
[ "$FORM" = "desktop" ] && PRESET="--preset=desktop"

export CHROME_PATH="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

cd "$ROOT"
npx lighthouse "$URL" \
  $PRESET \
  --output=json --output=html \
  --output-path="${OUT}/lighthouse-${NAME}" \
  --chrome-flags="--headless=new --no-first-run --no-default-browser-check" \
  --quiet || STATUS=$?

[ -n "$STARTED" ] && pkill -f "http.server ${PORT}" || true

mv -f "${OUT}/lighthouse-${NAME}.report.json" "${OUT}/lighthouse-${NAME}.json"
mv -f "${OUT}/lighthouse-${NAME}.report.html" "${OUT}/lighthouse-${NAME}.html"
echo "saved lighthouse/lighthouse-${NAME}.json and .html (${FORM})"
exit "${STATUS:-0}"
