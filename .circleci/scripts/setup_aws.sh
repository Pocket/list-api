#!/bin/bash
set -e

sudo apt-get update && sudo apt-get install -y python3-pip
# 2022-12-01 - awscli is pinned to fix a build error with 1.27.1 related to
# not finding a botocore version = 1.29.21. this can probably be
# un-pinned in the future?
pip3 install awscli-local awscli==1.27.20


for Script in .docker/localstack/*.sh ; do
    bash "$Script"
done
