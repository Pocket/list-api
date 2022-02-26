#!/bin/bash

cd /app
# Create a .npmrc file with a GitHub token
echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> ~/.npmrc
# npm ci
npm run start:dev
