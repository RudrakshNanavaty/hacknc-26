# One service for the whole game: the server serves the built app, /api and /ws (server/src/web.ts).
FROM oven/bun:1.4-slim
WORKDIR /repo

# Dependencies first, so code changes do not reinstall them.
COPY package.json bun.lock ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY server/package.json server/
RUN bun install --frozen-lockfile

COPY . .
# VITE_* flags are read at build time; pass them as build args to turn voice or AI off.
ARG VITE_FEATURE_VOICE
ARG VITE_FEATURE_AI
RUN bun run build

ENV NODE_ENV=production
# The host sets PORT; secrets come from its environment variables, never from this image.
CMD ["bun", "run", "start"]
