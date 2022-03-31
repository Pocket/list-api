FROM node:16-bullseye-slim@sha256:84166838030b78441db7c90e0407cee1da736157a70f398b6589ea1f4ffa753a
WORKDIR /usr/src/app

ARG GIT_SHA

COPY . .

ENV NODE_ENV=production
ENV PORT 4005
ENV TZ=US/Central
ENV GIT_SHA=${GIT_SHA}

EXPOSE ${PORT}

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

CMD ["npm", "start"]
