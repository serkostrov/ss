# АПСС(ЭР) — production web (SPA) for Dokploy
# Runtime env (Dokploy Environment): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_URL,
# VITE_TELEGRAM_BOT_URL, VITE_MAX_BOT_URL, VITE_MESSENGER_API_URL

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/messenger/package.json ./apps/messenger/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

COPY . .

# SPA reads VITE_* inlined into index.html at container start (see deploy/docker-entrypoint.sh).
# No build-time VITE_* required — avoids empty ARG wiping Dokploy env.
RUN npm run build

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache nodejs

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/inn-lookup-server.mjs /opt/inn-lookup-server.mjs
COPY deploy/docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

ENV VITE_SUPABASE_URL="" \
    VITE_SUPABASE_ANON_KEY="" \
    VITE_APP_URL="" \
    VITE_TELEGRAM_BOT_URL="" \
    VITE_MAX_BOT_URL="" \
    VITE_MESSENGER_API_URL=""

ENTRYPOINT ["/docker-entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
