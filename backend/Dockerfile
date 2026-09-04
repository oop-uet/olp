# This Dockerfile is intentionally built from the repository root, not backend/.
# The repository has one npm workspaces lockfile at package-lock.json; using the
# root as the build context keeps the production image reproducible.

# ── Stage 1: install and build the backend ──────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# bcrypt can fall back to a native build on an architecture without a prebuilt
# binary. Keep the toolchain in the builder only.
RUN apk add --no-cache python3 make g++

# npm workspaces needs each workspace manifest to resolve the root lockfile.
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci --workspace=@oop-platform/backend

COPY backend ./backend

# Fetch the immutable Checkstyle artefact while building the image. Java is
# installed only in the final image, so explicitly skip the optional JRE
# download here and fail the image build if the JAR was not obtained.
RUN CHECKSTYLE_SKIP_JRE_DOWNLOAD=1 npx tsc -p backend/tsconfig.json \
    && CHECKSTYLE_SKIP_JRE_DOWNLOAD=1 node backend/scripts/ensure-java.mjs \
    && test -s backend/.cache/checkstyle-10.26.1-all.jar

# Do not carry TypeScript, Vitest, or other development-only dependencies into
# the API image. The compiled output above is all the runtime needs.
RUN npm prune --omit=dev --workspace=@oop-platform/backend

# ── Stage 2: small production runtime ───────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app/backend

# Checkstyle runs in-process for practical exercises. No runtime download is
# allowed: a cold start must not depend on GitHub/Adoptium availability.
RUN apk add --no-cache openjdk17-jre-headless libstdc++

ENV NODE_ENV=production \
    CHECKSTYLE_JAVA_BIN=/usr/bin/java \
    CHECKSTYLE_JAR_PATH=/app/backend/.cache/checkstyle-10.26.1-all.jar \
    CHECKSTYLE_AUTO_DOWNLOAD=0 \
    CHECKSTYLE_AUTO_DOWNLOAD_JRE=0 \
    CHECKSTYLE_SKIP_JRE_DOWNLOAD=1

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/drizzle ./drizzle
COPY --from=builder /app/backend/assets ./assets
COPY --from=builder /app/backend/.cache ./.cache

# Zeabur supplies PORT at runtime. 3000 is only the local fallback in index.ts.
EXPOSE 3000

CMD ["node", "dist/index.js"]
