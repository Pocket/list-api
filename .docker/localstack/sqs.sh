#!/bin/bash
set -euo pipefail

SQS=(
pocket-publisher-data-queue
PermLib-Local-ItemMain
pocket-list-delete-queue
)

for sqs_queue in "${SQS[@]}"; do
  awslocal sqs create-queue --queue-name "${sqs_queue}"
done

set +x
