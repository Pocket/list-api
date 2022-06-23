FROM node:16-bullseye-slim@sha256:678b467339cdb3ddd10c8f7dfeb2e3cf18bd0a0ec25298fa59362d9703bd241e
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
