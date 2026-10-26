# ─── Backend Dockerfile ─────────────────────────────────────────────────────
# Practical 11: Containerization with Docker
#
# Base: node:18-alpine (Alpine Linux variant — ~1/3 the size of node:18-bullseye)
# This is NOT multi-stage for the backend because there is no build step —
# Node.js runs the source directly. Multi-stage is reserved for the frontend
# where a separate build stage compiles React before the serve stage.
#
# Layer ordering is CRITICAL for Docker build cache efficiency:
#   1. COPY package files first (changes rarely → cached unless deps change)
#   2. RUN npm install (expensive — only re-runs when package.json changes)
#   3. COPY source files last (changes frequently → only invalidates last layers)
#
# Why NOT copy node_modules from the host?
#   - node_modules may contain platform-specific native binaries compiled for
#     the host OS (e.g., Windows/macOS). These will NOT work inside a Linux
#     container. Always run npm install INSIDE the container.
#   - node_modules is excluded via .dockerignore to prevent it from bloating
#     the build context sent to the Docker daemon.

FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Step 1: Copy only dependency manifests (cache-friendly layer)
# If package.json hasn't changed, Docker reuses the cached npm install layer
COPY package*.json ./

# Step 2: Install production + dev dependencies inside the container
# --omit=dev would be used for production; we keep dev deps for dotenv etc.
RUN npm install

# Step 3: Copy all remaining source files
# This layer is rebuilt on every source change, but npm install is NOT re-run
COPY . .

# Document which port the container listens on (informational — does not publish)
# Actual publishing is done via docker-compose.yml ports mapping
EXPOSE 5000

# Start the Express server
CMD ["node", "server.js"]
