#!/usr/bin/env bash
set -euo pipefail

curl -sS \
  -X POST http://localhost:3000/v1/images/blur-sensitive-regions \
  -H 'Content-Type: application/json' \
  --data @examples/request.json
