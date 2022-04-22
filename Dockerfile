FROM node:16-bullseye-slim@sha256:d54981fe891c9e3442ea05cb668bc8a2a3ee38609ecce52c7b5a609fadc6f64b
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
