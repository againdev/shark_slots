# Чеклист: auth на shark_slots

## Домены (без proxy main → IP slots)

| Что | URL |
|-----|-----|
| Google login (браузер) | `https://slots1337dead.look1337amfbqotlamblz911.ru/auth/google/login` |
| Google callback (Google Console) | `https://slots1337dead.look1337amfbqotlamblz911.ru/auth/google/redirect` |
| Cookies (main) | `https://look1337amfbqotlamblz911.ru/auth/google/finish?code=…` |
| GraphQL / TG | `https://look1337amfbqotlamblz911.ru/graphql` |

## slots `.env` (значения проверь на проде)

```env
MAIN_APP_URL=https://<main-domain>          # без /, редирект на /auth/google/finish
GOOGLE_CALLBACK_URL=https://slots1337dead.look1337amfbqotlamblz911.ru/auth/google/redirect
CORS_ORIGIN=...,https://look1337amfbqotlamblz911.ru
INTERNAL_WEBHOOK_SECRET=...                 # = main
ACCESS_TOKEN_SECRET / REFRESH_TOKEN_SECRET  # = main
MAIN_DATABASE_URL=...                       # БД main, не локальный postgres slots
```

## main `.env`

```env
SLOTS_AUTH_BASE_URL=https://slots1337dead.look1337amfbqotlamblz911.ru
INTERNAL_WEBHOOK_SECRET=...                 # = slots
```

## main `frontend/.env`

```env
NEXT_PUBLIC_GOOGLE_AUTH_LINK=https://slots1337dead.look1337amfbqotlamblz911.ru/auth/google/login
NEXT_PUBLIC_DOMAIN=https://look1337amfbqotlamblz911.ru
```

## main nginx `shark.conf`

Только finish на main backend:

```nginx
location = /auth/google/finish {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Нет** `location /auth/google/` → IP slots.

## Cloudflare

- DNS slots → origin slots-сервер, SSL Full
- Cache: Bypass для `/auth/google/*` на slots и `/auth/google/finish` на main

## Деплой

1. slots: rebuild backend, nginx slots.conf
2. main: rebuild backend + frontend, reload nginx
3. Google Console: redirect URI = **slots** domain
