FROM node:24.22.1-bookworm-slim AS package-manager
WORKDIR /app
RUN npm install --global pnpm@11.22.0

FROM package-manager AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm worker:build && pnpm build

FROM package-manager AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24.22.1-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:24.22.1-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist-worker ./dist-worker
USER node
CMD ["node", "dist-worker/worker/index.js"]

FROM worker AS migrate
COPY --chown=node:node --from=build /app/drizzle ./drizzle
CMD ["node", "dist-worker/worker/migrate.js"]
