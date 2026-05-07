#!/usr/bin/env bash
# Spike: drive `claude` in bidirectional stream-json mode and capture stdin/stdout.
# Usage: ./spike-claude-stream.sh <fixture-name>
set -euo pipefail
FIXTURE_NAME="${1:?usage: $0 <fixture-name>}"
OUT_DIR="$(cd "$(dirname "$0")"/.. && pwd)/__fixtures__/claude-stream"
mkdir -p "$OUT_DIR"
cd "$(cd "$(dirname "$0")"/../.. && pwd)"
echo "[spike] running claude in $(pwd)"
echo "[spike] type Ctrl-D when done. stdout captured to $OUT_DIR/$FIXTURE_NAME.jsonl"
claude --input-format stream-json --output-format stream-json --verbose \
  | tee "$OUT_DIR/$FIXTURE_NAME.jsonl"
