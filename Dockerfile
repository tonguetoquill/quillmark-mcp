# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

FROM node:${NODE_VERSION}-slim AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY src/ ./src/
COPY test/ ./test/
COPY quiver/ ./quiver/
RUN node --test test/

FROM node:${NODE_VERSION}-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r quill \
 && useradd -r -g quill -u 10001 -d /app -s /usr/sbin/nologin quill \
 && mkdir -p /app /data/artifacts \
 && chown -R quill:quill /app /data

WORKDIR /app
COPY --from=deps --chown=quill:quill /app/node_modules ./node_modules
COPY --chown=quill:quill package.json ./
COPY --chown=quill:quill src/ ./src/
COPY --chown=quill:quill quiver/ ./quiver/
COPY --chown=quill:quill docker/healthcheck.js ./docker/healthcheck.js

USER quill:quill

ENV NODE_ENV=production \
    LOG_LEVEL=info \
    QUILLMARK_BIND=0.0.0.0:8080 \
    QUILLMARK_OUTPUT_DIR=/data/artifacts \
    QUILLMARK_QUIVER_DIR=/app/quiver \
    QUILLMARK_ENDPOINT=/mcp

EXPOSE 8080
VOLUME ["/data/artifacts"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node /app/docker/healthcheck.js || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "node", "src/bin.js"]
