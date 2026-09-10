#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf 'VexWorld needs Node.js 20 or newer. Run setup-vexworld.command after installing Node.js LTS.\n'
  exit 1
fi
exec node scripts/vexworld-launch.mjs start
