#!/bin/bash
set -e

sudo apt-get update && sudo apt-get install -y python3-pip
pip3 install boto3==1.26.123 awscli-local awscli==1.27.123


for Script in .docker/localstack/*.sh ; do
    bash "$Script"
done
