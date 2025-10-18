# Build stage
FROM node:lts-alpine@sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467aaaea42d6225af AS build

RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

WORKDIR /usr/src/app

COPY package.json .
COPY package-lock.json .

RUN npm ci --omit=dev

# Runtime stage
FROM node:lts-alpine@sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467aaaea42d6225af

RUN apk add --no-cache \
    dumb-init \
    cairo \
    jpeg \
    pango \
    giflib \
    fontconfig \
    ttf-dejavu \
    ttf-freefont

ENV NODE_ENV=production
WORKDIR /usr/src/app

RUN mkdir -p /usr/src/app/database && chown -R node:node /usr/src/app/database
RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs && chmod 750 /usr/src/app/logs

COPY --from=build /usr/src/app /usr/src/app
COPY --chown=node:node . /usr/src/app

USER node

CMD ["dumb-init", "node", "/usr/src/app/index.js"]