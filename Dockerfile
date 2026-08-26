FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SECOND_ORIGIN_URL=http://localhost:3200
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/tsconfig.json /app/tsconfig.app.json /app/tsconfig.server.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000 3200
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/ready" || exit 1
CMD ["node", "--env-file-if-exists=.env", "--import=tsx", "server/index.ts"]
