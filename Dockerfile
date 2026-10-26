# ─── Frontend Dockerfile (Multi-Stage Build) ────────────────────────────────
# Practical 11: Supplementary — Multi-Stage Build to reduce image size
#
# Why multi-stage for the frontend but not the backend?
#   The React app must be compiled (npm run build) into static HTML/CSS/JS.
#   The build tools (Vite, ESLint, TypeScript compiler, ~300 MB of devDependencies)
#   are only needed DURING the build — they must NOT end up in the final image.
#
# Stage 1 (builder): Full Node.js environment → installs ALL deps → runs build
# Stage 2 (runner):  Starts fresh from node:18-alpine → copies ONLY /dist →
#                    installs ONLY the packages needed to serve (Vite preview)
#
# Size comparison (approximate):
#   Without multi-stage: ~900 MB (all devDependencies included)
#   With multi-stage:    ~300 MB (only production deps + built assets)
#
# Vite's `preview` command serves the production build and is suitable for
# this lab. For a real production deployment, you would serve /dist with
# a dedicated web server like Nginx (even smaller, ~25 MB).

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

LABEL stage="builder"

WORKDIR /app

# Cache-friendly: copy manifests first, install, then copy source
COPY package*.json ./
RUN npm install

# Copy source and build the production bundle
COPY . .
RUN npm run build
# After this stage, /app/dist contains the compiled React app


# ── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM node:18-alpine AS runner

WORKDIR /app

# Copy ONLY the package manifests for the serve stage
COPY package*.json ./

# Install ONLY production dependencies (Vite is needed for vite preview)
# In a real production image, replace this with a static server like:
#   FROM nginx:alpine
#   COPY --from=builder /app/dist /usr/share/nginx/html
RUN npm install

# Copy the compiled bundle from the builder stage (NOT the source code)
COPY --from=builder /app/dist ./dist

# Vite preview listens on port 4173 by default
# We remap to 5173 via --port flag to match our docker-compose port mapping
EXPOSE 5173

# --host 0.0.0.0 binds to all interfaces inside the container
# (required — without this, the server only listens on 127.0.0.1 and is
#  unreachable from outside the container even with port mapping)
# vite.config.js already sets preview.host = true and preview.port = 5173
# so we just call `npm run preview` with no extra flags needed
CMD ["npm", "run", "preview"]
