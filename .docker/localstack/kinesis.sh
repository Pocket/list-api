#!/bin/bash
set -x

STREAMS=('analytics.user_action' 'analytics.web_track' 'unified_event' 'raw_event')

for stream in "${STREAMS[@]}"; do
  awslocal kinesis create-stream --stream-name "${stream}" --shard-count 3
done
set +x
