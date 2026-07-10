#!/usr/bin/env bash
set -euo pipefail

curl -sS \
  -X POST http://localhost:3000/v1/pdfs/to-jpeg \
  -H 'Content-Type: application/json' \
  --data @examples/pdf-request.json
