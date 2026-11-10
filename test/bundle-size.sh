#!/bin/bash
# Bundle size (MRV-9.9). From the project root:  bash test/bundle-size.sh [image]
#   image   a built client image (default deploy-client:latest, i.e. `docker compose -f deploy/docker-compose.yml build client`)
# GATE (exit 1 when over): the TOTAL, 300,000 B = gzip -9 -n -c, file by file, over every .js and .css under the served root,
#   the hero island (island/ribbons.js, its own 60 KB budget) excluded. The cap was 237,975 B until 2026-11-03 (owner decision).
# REPORTED, NOT GATED: the FIRST VISIT of `/`: the same measure over the files index.html loads up front (scripts, modulepreloads,
#   stylesheets), i.e. the initial chunks only; lazy route chunks, fonts and images are not in it.
set -euo pipefail
IMAGE="${1:-deploy-client:latest}"
CAP=300000
MSYS_NO_PATHCONV=1 docker run --rm --entrypoint sh "$IMAGE" -c '
cd /usr/share/nginx/html
total=0; n=0
for f in $(find . -type f \( -name "*.js" -o -name "*.css" \) ! -path "./island/*" | sort); do
  s=$(gzip -9 -n -c "$f" | wc -c); total=$((total + s)); n=$((n + 1))
done
first=0; m=0
for u in $(grep -oE "(src|href)=\"[^\"]+\.(js|css)\"" index.html | sed -E "s/^(src|href)=\"//; s/\"$//" | sort -u); do
  f="./${u#/}"
  case "$f" in ./island/*) continue ;; esac
  [ -f "$f" ] || continue
  s=$(gzip -9 -n -c "$f" | wc -c); first=$((first + s)); m=$((m + 1))
done
echo "total $total $n"
echo "first $first $m"
' | {
  read -r _ total n; read -r _ first m
  echo "Total, all js+css (island excluded): $total B in $n files (gate $CAP B, headroom $((CAP - total)) B)"
  echo "First visit of / (initial js+css only, reported not gated): $first B in $m files"
  [ "$total" -le "$CAP" ]
}
