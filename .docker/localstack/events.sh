#!/bin/bash
set -x

awslocal events create-event-bus \
  --name default

set +x
