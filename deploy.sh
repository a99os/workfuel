#!/usr/bin/env bash
# Deploy current HEAD to the UzCloud server. .env must already exist on the server in /opt/workfuel.
set -euo pipefail
HOST=${HOST:-root@109.94.173.160}
KEY=${KEY:-$HOME/.ssh/edu_crm_uzcloud}
git archive --format=tar.gz HEAD -o /tmp/workfuel.tar.gz
scp -i "$KEY" /tmp/workfuel.tar.gz "$HOST:/tmp/workfuel.tar.gz"
ssh -i "$KEY" "$HOST" 'set -e; mkdir -p /opt/workfuel && tar -xzf /tmp/workfuel.tar.gz -C /opt/workfuel && cd /opt/workfuel && docker compose up -d --build && docker image prune -f >/dev/null'
rm -f /tmp/workfuel.tar.gz
