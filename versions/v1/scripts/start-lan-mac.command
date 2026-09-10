#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
npm run compile
exec node src/server/server.mjs --lan --open
