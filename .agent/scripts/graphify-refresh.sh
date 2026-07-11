#!/usr/bin/env bash
set -euo pipefail

cd /workspace
export PATH="$HOME/.local/bin:$PATH"

echo "Updating MYLIT Graphify code graph..."
graphify update /workspace/lit-app --no-cluster --force

rm -rf /workspace/graphify-out
ln -sT /workspace/lit-app/graphify-out /workspace/graphify-out

echo "Graph ready:"
ls -lh /workspace/graphify-out/graph.json
