#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf '\nVexWorld needs Node.js 20 or newer.\nInstall Node.js LTS, then open this file again:\nhttps://nodejs.org/\n\n'
  if command -v open >/dev/null 2>&1; then open https://nodejs.org/ || true; fi
  exit 1
fi
exec node scripts/vexworld-launch.mjs setup
