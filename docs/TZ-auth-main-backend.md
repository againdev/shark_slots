# ТЗ: адаптация основного бэкенда Shark под auth через shark_slots

**Цель:** Telegram Login Widget, привязка TG и Google OAuth обрабатываются на **shark_slots** (Mini App login **не используется**) (доступ к `MAIN_DATABASE_URL`). Для браузера и фронтенда все URL остаются на **домене основного сайта** (`MAIN_APP_URL` / `NEXT_PUBLIC_DOMAIN`). Пользователь **не видит** домен slots-сервера.

**Уже реализовано на shark_slots (этот репозиторий):**

| Endpoint | Назначение |
|----------|------------|
| `GET /auth/google/login` | Старт Google OAuth (без префикса `/api`) |
| `GET /auth/google/redirect` | Callback Google → JWT cookies → redirect на фронт |
| `POST /api/internal/auth/telegram` | Login Widget: проверка hash, upsert User, токены |
| `POST /api/internal/auth/connect-telegram` | Привязка TG к существующему userId |

Все `POST /api/internal/auth/*` требуют заголовок:

```http
X-Internal-Webhook-Secret: <INTERNAL_WEBHOOK_SECRET>
```

Ответ telegram:

```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "userId": "uuid"
}
```

Main backend должен **проставить cookies** `access_token` и `refresh_token` на ответ GraphQL (те же секреты JWT, что на slots).

---

## 1. Переменные окружения (main `backend/.env`)

Добавить:

```env
# Базовый URL shark_slots (внутренняя сеть Docker или private IP)
SLOTS_AUTH_BASE_URL=http://slots-backend:4001
# или http://<IP_сервера_slots>:4001

# Тот же секрет, что INTERNAL_WEBHOOK_SECRET на shark_slots
INTERNAL_WEBHOOK_SECRET=...
```

**Не менять на фронте:**

- `NEXT_PUBLIC_DOMAIN` — основной домен
- `NEXT_PUBLIC_GOOGLE_AUTH_LINK` — `{DOMAIN}/auth/google/login`

**Google Cloud Console:**

- Redirect URI: `https://<MAIN_DOMAIN>/auth/google/redirect` (домен **main**, не slots)
- Client ID / Secret — те же, что в `.env` shark_slots (`GOOGLE_CLIENT_*`)

---

## 2. Nginx основного сайта (`fullstack/shark/nginx/shark.conf`)

Заменить проксирование Google с локального backend на **shark_slots**:

```nginx
# Было: proxy_pass http://127.0.0.1:4000;
location ~ ^/auth/google/.*$ {
    proxy_pass http://<SLOTS_UPSTREAM>;   # например http://10.x.x.x:4001
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
}
```

`<SLOTS_UPSTREAM>` — IP:порт контейнера `slots-backend` (4001), доступный с хоста main.

**Важно:** `proxy_set_header Host $host` — cookies и redirect остаются на домене main.

GraphQL `/graphql` по-прежнему на main `:4000`.

---

## 3. Новый сервис на main: `AuthSlotsProxyService`

**Путь:** `backend/src/auth/auth-slots-proxy.service.ts`

**Зависимости:** `axios`, `ConfigService`

**Методы:**

```typescript
async proxyTelegram(input, req): Promise<AuthTokenPairDto>
async proxyConnectTelegram(userId, input): Promise<{ tgId: number }>
```

**Реализация:**

- `POST ${SLOTS_AUTH_BASE_URL}/api/internal/auth/telegram`
- `POST ${SLOTS_AUTH_BASE_URL}/api/internal/auth/connect-telegram`
- Header: `X-Internal-Webhook-Secret`
- Body для telegram: поля GraphQL input + `cookies: req.cookies` + `headers: { 'x-forwarded-for': req.headers['x-forwarded-for'], ... }`
- Timeout 30s; при ошибке — `ServiceUnavailableException` или `BadRequestException` с сообщением slots

---

## 4. Изменения `AuthResolver` (main)

### 4.1 `authenticate` (Mini App) — **отключить на main**

Мутация `authenticate` (initData Mini App) **не проксировать** на slots. Варианты:

- удалить mutation из schema / resolver;
- или возвращать `BadRequestException('Mini App login is disabled')`.

Фронт: убрать автологин из `AuthProvider` (см. `frontend/src/providers/AuthProvider.tsx`).

### 4.2 `authenticateTelegram`

**Стало:** proxy → `applyTokenPairToResponse`.

### 4.3 `connectTgAccountToUser`

**Стало:**

```typescript
const userId = context.req.user.sub;
return this.authSlotsProxy.proxyConnectTelegram(userId, input, context.req);
```

### 4.4 Email register/login / refresh / getMe

**Без изменений** — остаются на main.

---

## 5. Новый метод `AuthService.applyTokenPairToResponse`

**Путь:** `backend/src/auth/auth.service.ts`

```typescript
applyTokenPairToResponse(pair: { accessToken: string; refreshToken: string }, res: Response): void {
  this.setCookie(res, 'access_token', pair.accessToken, true);
  this.setCookie(res, 'refresh_token', pair.refreshToken, true);
}
```

(Использовать существующий `setCookie` — те же опции `sameSite: none`, `secure: true`.)

---

## 6. Удалить / отключить на main

| Компонент | Действие |
|-----------|----------|
| `AuthController` (`/auth/google/*`) | **Удалить** или не регистрировать в `AuthModule` — маршруты обслуживает nginx → slots |
| `GoogleStrategy`, `GoogleAuthGuard` | Убрать из `providers` main `AuthModule` |
| `PassportModule` в `app.module` | Убрать, если только Google |
| `handleGoogleAuth`, `validateTelegramAuth`, `updateOrCreateUser` (TG) | Можно удалить после прокси **или** оставить deprecated |

**Не удалять:** `issueTokens` / `setCookie` / `refreshToken` / email auth / `connectTg` логику, если ещё используется — только заменить TG/Mini App на proxy.

---

## 7. `AuthModule` (main)

```typescript
providers: [
  AuthResolver,
  AuthService,
  AuthSlotsProxyService,  // NEW
  JwtService,
  PrismaService,
  // убрать GoogleStrategy, GoogleAuthGuard
],
controllers: [], // убрать AuthController
```

---

## 8. Rate limit

В `rate-limit.guard.ts` исключения для `/auth/google/*` на main **больше не нужны** (запросы не попадают в Nest main). При необходимости добавить rate limit на nginx для `/auth/google/`.

---

## 9. Схема потоков

### Google (браузер)

```
Frontend → GET https://main.com/auth/google/login?width=&height=
    → nginx main → slots:4001/auth/google/login
    → Google OAuth
    → GET https://main.com/auth/google/redirect?code=...
    → nginx main → slots → JWT cookies (Domain path main) → redirect main.com/
```

### Telegram Login Widget

```
Frontend → mutation authenticateTelegram → proxy → /api/internal/auth/telegram → setCookie
```

---

## 10. Проверка (чеклист)

- [ ] `INTERNAL_WEBHOOK_SECRET` совпадает на main и slots
- [ ] `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` / `EXPIRES_IN_*` **идентичны** на main и slots
- [ ] `BOT_TOKEN` только на slots (можно убрать с main после миграции)
- [ ] `GOOGLE_*` на slots; redirect URI в Google Console = main domain
- [ ] nginx main проксирует `/auth/google/` на slots:4001
- [ ] Фронт **не** содержит URL slots-домена
- [ ] Web TG login + Google login + link Google (`?link=1`); Mini App отключён
- [ ] `getMe` / WS `refreshToken` после логина работают (токены выданы теми же секретами)

---

## 11. Откат

1. Вернуть `proxy_pass` `/auth/google/` на `127.0.0.1:4000`
2. Вернуть `GoogleStrategy` + `AuthController` на main
3. В resolver снова вызывать локальный `AuthService` для TG

---

## 12. Файлы main для правки (список для Cursor)

```
backend/src/app.config.ts          — SLOTS_AUTH_BASE_URL
backend/src/auth/auth-slots-proxy.service.ts  — NEW
backend/src/auth/auth.service.ts   — applyTokenPairToResponse
backend/src/auth/auth.resolver.ts  — proxy TG; отключить authenticate (Mini App)
frontend/src/providers/AuthProvider.tsx  — убрать mutation authenticate
backend/src/auth/auth.module.ts    — wire proxy, remove Google
backend/src/auth/auth.controller.ts — delete or unregister
backend/src/auth/utils/google-*.ts — remove from module
nginx/shark.conf                   — proxy /auth/google/ to slots
```

---

## 13. Ошибки и логирование

- Slots при недоступной main DB: лог каждые 10s, Mobule 503; **auth internal** вернёт 500/503 — main должен отдать `BadRequestException('Authentication failed')` как сейчас.
- Логировать на main: `AuthSlotsProxy failed: ${url} ${status}`.

---

*Документ сгенерирован под реализацию в shark_slots (`src/auth/`). При изменении путей internal API обновить этот файл и proxy на main.*
