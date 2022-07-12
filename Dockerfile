FROM node:16-bullseye-slim@sha256:4aa1ccb69da04d4b04fcfe01fde3c58bf8af4bb6e8898e152fb636f280f84241
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
