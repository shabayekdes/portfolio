#!/usr/bin/env bash
# Render a 1200x630 blog cover from design/post-cover.html into images/blog/<slug>.jpg.
#
#   design/render-post-cover.sh <slug> <title> [highlight] [tags] [file] [code]
#
# Example:
#   design/render-post-cover.sh multi-tenant-saas-laravel \
#     "Multi-tenant SaaS in Laravel: isolation that fails closed" \
#     "isolation that fails closed" "Laravel, SaaS, Architecture" \
#     BelongsToTenant.php $'// scoped by default\nstatic::addGlobalScope(...);'
#
# Then add `image: /images/blog/<slug>.jpg` to the post's front matter.
set -euo pipefail

[ $# -ge 2 ] || { sed -n '2,13p' "$0"; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/images/blog/$1.jpg"
tmp=$(mktemp --suffix=.png)
trap 'rm -f "$tmp"' EXIT

url=$(python3 -c '
import sys, urllib.parse as u
keys = ["title", "hl", "tags", "file", "code"]
print("file://" + sys.argv[1] + "?" + u.urlencode({k: v for k, v in zip(keys, sys.argv[2:]) if v}))
' "$root/design/post-cover.html" "${@:2}")

mkdir -p "$root/images/blog"
google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 \
	--virtual-time-budget=5000 --screenshot="$tmp" "$url" 2>/dev/null
convert "$tmp" -quality 85 "$out"
echo "Wrote ${out#$root/}"
