# Game server image (Railway builds this file; see railway.toml).
# The Node major is pinned here, in .nvmrc and in package.json `engines` (NODE-01).
FROM node:26-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install exactly what the lockfile says, without dev dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Least privilege: the image's unprivileged user.
USER node

# Railway injects PORT; 3001 is the local default.
EXPOSE 3001

# `node` directly (not `npm start`) so SIGTERM reaches the process.
CMD ["node", "server.js"]
