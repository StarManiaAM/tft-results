FROM node:lts-alpine@sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467aaaea42d6225af
RUN apk add --no-cache \
    dumb-init \
    python3 \
    py3-pip \
    py3-setuptools \
    py3-wheel \
    python3-dev \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --chown=node:node . /usr/src/app
RUN npm ci --omit=dev
RUN mkdir -p database && chown -R node:node /usr/src/app
USER node
CMD ["dumb-init", "node", "/usr/src/app/index.js"]