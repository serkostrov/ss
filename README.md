# АПСС «Северное сияние»

Production-ready MVP информационной системы ассоциации.

## Стек

- **Web:** Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, Lucide, React Router, TanStack Query, RHF, Zod, Supabase
- **Messenger worker:** Node.js (отдельный процесс)
- **Архитектура frontend:** Feature-Sliced Design (light)

## Структура

```
apps/web          — SPA (/admin + /cabinet)
apps/messenger    — Telegram ↔ Max worker
packages/shared   — общие типы/константы
supabase/         — миграции и seed
docs/             — runbooks и инструкция
```

## Быстрый старт

```bash
npm install
cp .env.example .env
npm run dev
```

Приложение: http://localhost:5173

> Автозаполнение компании по ИНН на регистрации в `npm run dev` идёт через локальный `/api/company-by-inn`.
> В production нужна Edge Function: `supabase functions deploy lookup-company-by-inn`.

## Деплой (Dokploy)

См. [docs/DEPLOY_DOKPLOY.md](docs/DEPLOY_DOKPLOY.md).

Кратко: Docker-образ SPA (`Dockerfile` + nginx), Node **22**, порт **80**.
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL` — **runtime Environment** в Dokploy (см. [docs/DEPLOY_DOKPLOY.md](docs/DEPLOY_DOKPLOY.md)).
Миграции Supabase — отдельно.

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер web |
| `npm run build` | Production build web |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run typecheck` | TypeScript check |

## Алиасы (apps/web)

`@`, `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared`, `@processes`
