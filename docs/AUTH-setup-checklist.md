# Чеклист: auth

## Google OAuth — **main backend only**

| Что | URL |
|-----|-----|
| Login | `https://look1337amfbqotlamblz911.ru/auth/google/login` |
| Callback (Google Console) | `https://look1337amfbqotlamblz911.ru/auth/google/redirect` |
| После входа | редирект `/?oauth=google`, cookies на main |

## reCAPTCHA — **slots only**

| Что | URL |
|-----|-----|
| iframe | `https://slots1337dead…/auth/recaptcha` |
| verify API | main → `POST slots/api/internal/auth/verify-recaptcha` |

## main `backend/.env`

```env
APP_DOMAIN=https://look1337amfbqotlamblz911.ru
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://look1337amfbqotlamblz911.ru/auth/google/redirect
SLOTS_AUTH_BASE_URL=https://slots1337dead.look1337amfbqotlamblz911.ru
INTERNAL_WEBHOOK_SECRET=...
```

## main `frontend/.env`

```env
NEXT_PUBLIC_DOMAIN=https://look1337amfbqotlamblz911.ru
NEXT_PUBLIC_GOOGLE_AUTH_LINK=https://look1337amfbqotlamblz911.ru/auth/google/login
NEXT_PUBLIC_SLOTS_RECAPTCHA_URL=https://slots1337dead.look1337amfbqotlamblz911.ru/auth/recaptcha
```

## slots `.env` (auth container)

```env
MAIN_APP_URL=https://look1337amfbqotlamblz911.ru
RECAPTCHA_SITE_KEY=...
RECAPTCHA_SECRET_KEY=...
# Без GOOGLE_* — Google удалён со slots
```

## nginx

**main `shark.conf`:** `location ^~ /auth/google/` → `127.0.0.1:4000`

**slots `slots.conf`:** `/auth/recaptcha`, `/api/internal/auth` → `:4001` (нет `/auth/google/`)

## Деплой

1. main: rebuild backend + frontend, reload nginx
2. slots: rebuild `slots-auth`, reload nginx, `MAIN_APP_URL` = main domain
3. Google Console redirect URI = main `/auth/google/redirect`
