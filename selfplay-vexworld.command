#!/bin/bash
set -e
cd "$(dirname "$0")"
node scripts/vexworld-selfplay.mjs --headed
