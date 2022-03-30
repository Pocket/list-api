FROM node:16-bullseye-slim@sha256:5c684b5147ceb9b2cd036800ef086414f101042bba142cca50d0445d1518bda9
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
