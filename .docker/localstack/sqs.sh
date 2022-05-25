#!/bin/bash
set -x

SQS=(
pocket-publisher-data-queue
pocket-list-delete-queue
)

for sqs_queue in "${SQS[@]}"; do
  awslocal sqs create-queue --queue-name "${sqs_queue}"
done

set +x
