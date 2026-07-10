#!/usr/bin/env bash
set -euo pipefail

curl -sS \
  -X POST http://localhost:3000/v1/images/blur-sensitive-regions/batch \
  -H 'Content-Type: application/json' \
  --data @examples/batch-request.json
