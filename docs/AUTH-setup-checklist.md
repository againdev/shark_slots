# Чеклист: auth

## Google OAuth — **main backend only**

| Что | URL |
|-----|-----|
| Login | `https://look1337amfbqotlamblz911.ru/auth/google/login` |
| Callback (Google Console) | `https://look1337amfbqotlamblz911.ru/auth/google/redirect` |
| После входа | редирект `/?oauth=google`, cookies на main |

## reCAPTCHA — **main backend only**

| Что | URL |
|-----|-----|
| iframe | `https://look1337amfbqotlamblz911.ru/auth/recaptcha` |
| verify | локально на main (`RecaptchaService`), без прокси на slots |

## main `backend/.env`

```env
APP_DOMAIN=https://look1337amfbqotlamblz911.ru
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://look1337amfbqotlamblz911.ru/auth/google/redirect
RECAPTCHA_SITE_KEY=...
RECAPTCHA_SECRET_KEY=...
SLOTS_AUTH_BASE_URL=https://slots1337dead.look1337amfbqotlamblz911.ru
INTERNAL_WEBHOOK_SECRET=...
```

## main `frontend/.env`

```env
NEXT_PUBLIC_DOMAIN=https://look1337amfbqotlamblz911.ru
NEXT_PUBLIC_GOOGLE_AUTH_LINK=https://look1337amfbqotlamblz911.ru/auth/google/login
# iframe: ${NEXT_PUBLIC_DOMAIN}/auth/recaptcha
```

## slots `.env` (auth container)

```env
MAIN_APP_URL=https://look1337amfbqotlamblz911.ru
# Без GOOGLE_* и RECAPTCHA_* — только Telegram internal auth
```

## nginx

**main `shark.conf`:** `/auth/google/` и `/auth/recaptcha` → `127.0.0.1:4000`

**slots `slots.conf`:** `/api/internal/auth` → `:4001` (нет `/auth/recaptcha`, нет `/auth/google/`)

## Деплой

1. main: rebuild backend + frontend, **force-recreate nginx** (см. AGENTS.md)
2. slots: rebuild `slots-auth`, reload nginx (reCAPTCHA больше не нужен на slots)
3. Google Console redirect URI = main `/auth/google/redirect`
4. Google reCAPTCHA console: домены main (не slots)
