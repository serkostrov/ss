# Деплой на Dokploy

SPA (`apps/web`) раздаётся через nginx. Backend — hosted Supabase (миграции отдельно).
Messenger worker (`Dockerfile.messenger`) принимает webhooks Telegram/Max и пишет посты каналов в `messages`.

## Важно про `VITE_*`

Значения читаются **в runtime** из `/env.js` (генерируется при старте контейнера).

В Dokploy задавайте их в **Environment** (переменные окружения контейнера), не только Build Arguments:

| Name | Example |
|------|---------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `VITE_APP_URL` | `https://your-domain` (можно оставить пустым → берётся origin) |

После смены env достаточно **Redeploy / Restart** (пересборка не обязательна).

## 1. Перед деплоем

1. Примените миграции из `supabase/migrations/` к проекту Supabase.
2. Автозаполнение по ИНН в production идёт через **same-origin** `/api/company-by-inn` внутри Docker-образа (Node sidecar + nginx). Edge Function **не обязательна**. Опционально:

```bash
supabase functions deploy lookup-company-by-inn --no-verify-jwt
```

3. В Supabase → Authentication → URL Configuration:
   - **Site URL** = `https://your-domain`
   - **Redirect URLs** = `https://your-domain/**`

## 2. Dokploy: Application (Dockerfile)

1. **New Application** → Git.
2. Build type: **Dockerfile**, path `Dockerfile`.
3. Port: **80**.
4. **Environment** (runtime):

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_URL=https://your-domain
```

5. Domain → HTTPS.
6. Deploy.

Проверка: `/env.js` на домене должен содержать ваши URL (не `${VITE_...}`).
Маршруты `/admin/...`, `/cabinet/...` — без 404.

## 3. Compose

`docker-compose.yml` пробрасывает те же `environment` в сервис `web`.

## 4. Локальная проверка образа

```bash
docker build -t apss-web .

docker run --rm -p 8080:80 \
  -e VITE_SUPABASE_URL=https://xxx.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=your-anon-key \
  -e VITE_APP_URL=http://localhost:8080 \
  apss-web
```

## 5. Messenger worker

Отдельное приложение: `Dockerfile.messenger`, порт **8787** (или `PORT`).

**Environment (runtime secrets, не в web-образе):**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
MAX_BOT_TOKEN=
MAX_WEBHOOK_SECRET=
PUBLIC_WEBHOOK_BASE_URL=https://messenger.your-domain
PORT=8787
LOG_LEVEL=info
```

`PUBLIC_WEBHOOK_BASE_URL` — публичный **HTTPS** origin, доступный из интернета (без `/webhooks/...`). Worker сам добавит пути. При старте регистрируются Telegram `setWebhook` и Max `POST /subscriptions`.

Если web и messenger в одном compose: укажите домен **web** (nginx проксирует `/webhooks/` → `messenger:8787`). Пример: `https://ss-front-….sslip.io`.

Локально без публичного HTTPS: `cloudflared tunnel --url http://localhost:8787` и подставьте выданный `https://….trycloudflare.com` в `PUBLIC_WEBHOOK_BASE_URL`.

Эндпоинты:

- `GET /health`
- `POST /webhooks/telegram`
- `POST /webhooks/max`

Для Max API на Windows/Alpine может понадобиться корневой сертификат Минцифры (`NODE_EXTRA_CA_CERTS`), иначе будет `fetch failed`.

Подробнее: [MESSENGER_CHAT_IDS.md](./MESSENGER_CHAT_IDS.md).

## 6. Частые проблемы

| Симптом | Причина |
|---------|---------|
| Invalid environment configuration | Нет **runtime** `VITE_*` в Environment Dokploy |
| `/env.js` с `${VITE_...}` | Entrypoint не отработал / env пустые при старте |
| 404 на `/admin/...` | SPA `try_files` (см. `deploy/nginx.conf`) |
| Auth redirect не туда | `VITE_APP_URL` / Site URL в Supabase |
| Автозаполнение по ИНН недоступно | Старый образ без Node sidecar — **Redeploy** с актуальным `Dockerfile` |
| Каналы не появляются в picker | Worker не запущен / бот не добавлен в канал / webhook не зарегистрирован |
| Посты не в ленте | Канал не привязан к рабочей группе в «Чаты» |
