# Деплой на Dokploy

SPA (`apps/web`) раздаётся через nginx. Backend — hosted Supabase (миграции отдельно).
Messenger worker пока scaffold — в Dokploy можно не деплоить.

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
2. Задеплойте Edge Function поиска по ИНН (нужна для автозаполнения названия на регистрации в production):

```bash
supabase functions deploy lookup-company-by-inn
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

## 5. Messenger (позже)

Когда worker будет слушать webhooks — `Dockerfile.messenger`, секреты отдельно от web.

## 6. Частые проблемы

| Симптом | Причина |
|---------|---------|
| Invalid environment configuration | Нет **runtime** `VITE_*` в Environment Dokploy |
| `/env.js` с `${VITE_...}` | Entrypoint не отработал / env пустые при старте |
| 404 на `/admin/...` | SPA `try_files` (см. `deploy/nginx.conf`) |
| Auth redirect не туда | `VITE_APP_URL` / Site URL в Supabase |
