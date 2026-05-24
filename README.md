# shark_slots

Callback-сервер для Shark: **Mobule (слоты)**, **Crypto Pay (платежи)**, **Auth (логин)**.  
Две БД: локальная PostgreSQL (`SlotSpins`) + удалённая main (`MAIN_DATABASE_URL`).

Подробная архитектура — в [AGENTS.md](./AGENTS.md).

---

## Стек на сервере

Продакшен — **4 Docker Compose-стека** в сети `slots-net`:

| Стек | Файл | Контейнеры | Порт (localhost) |
|------|------|------------|------------------|
| **1 — инфра** | `docker-compose.yml` | `slots-postgres`, `slots-redis`, `slots-adminer`, `slots-postgres-backup`, `slots-nginx` | 80, 443 |
| **2 — логин** | `docker-compose.auth.yml` | `slots-auth` | `4001` |
| **3 — слоты** | `docker-compose.slots.yml` | `slots-mobule` | `4002` |
| **4 — платежи** | `docker-compose.payments.yml` | `slots-payments` | `4003` |

```text
Internet ──► slots-nginx (host :80/:443)
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
 :4001 auth   :4002 mobule  :4003 payments
 (Google/TG)  (Mobule)      (Crypto Pay)
     │           │           │
     └───────────┴───────────┘
                 │
     slots-net ──┼──► slots-postgres  (DATABASE_URL — только mobule)
                 └──► slots-redis     (auth + mobule)

slots-auth / slots-mobule ──► MAIN_DATABASE_URL (Postgres Shark)
slots-payments ──► MAIN_APP_URL (forward webhook на main)
```

**Изоляция:** падение `slots-mobule` не валит Google login; падение `slots-auth` не валит Mobule-колбэки.

> `.env` **не попадает в Docker-образ**. Один файл `.env` на сервере; каждый контейнер валидирует **только свои** переменные (`APP_ROLE`).

---

## Маршруты nginx (`nginx/slots.conf`)

| URL | Контейнер | Порт |
|-----|-----------|------|
| `/auth/*` | `slots-auth` | 4001 |
| `/api/internal/auth/*` | `slots-auth` | 4001 |
| `/mobule/*` | `slots-mobule` | 4002 |
| `/api/crypto-bot/*` | `slots-payments` | 4003 |

---

## Требования на сервере

- Linux, Docker Engine + Compose v2
- Git
- Домен slots + Let's Encrypt
- Порты **80**, **443** (nginx); **4001–4003** только на `127.0.0.1`

```bash
docker --version
docker compose version
```

---

## Первый деплой

### 1. Клонировать репозиторий

```bash
cd /opt
git clone https://github.com/againdev/shark_slots.git
cd shark_slots
```

Нужен актуальный **`package-lock.json`** (для `npm ci` в Dockerfile).

### 2. Создать `.env`

```bash
nano .env
```

Один `.env` на все сервисы. Каждый контейнер проверяет только нужные ключи:

| Переменная | auth | slots | payments |
|------------|:----:|:-----:|:--------:|
| `POSTGRES_*`, `DATABASE_URL` | | ✓ | |
| `MAIN_DATABASE_URL` | ✓ | ✓ | |
| `REDIS_*` | ✓ | ✓ | |
| `MAIN_APP_URL` | ✓ | ✓ | ✓ |
| `INTERNAL_WEBHOOK_SECRET` | ✓ | | ✓ |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `EXPIRES_IN_*` | ✓ | ✓ | |
| `CORS_*` | ✓ | | |
| `BOT_TOKEN`, `GOOGLE_*`, `RECAPTCHA_*` | ✓ | | |
| `MOBULE_SECRET_TOKEN`, `MOBULE_ALLOWED_IPS` | | ✓ | |
| `CRYPTO_BOT_API_TOKEN` | | | ✓ |

Примеры значений:

```env
DATABASE_URL=postgresql://USER:PASS@slots-postgres:5432/postgres
MAIN_DATABASE_URL=postgresql://...@157.22.192.247:5432/postgres
REDIS_HOST=slots-redis
REDIS_PORT=6379
MAIN_APP_URL=https://look1337amfbqotlamblz911.ru
GOOGLE_CALLBACK_URL=https://look1337amfbqotlamblz911.ru/auth/google/redirect
```

### 3. SSL и nginx

```bash
sudo certbot certonly --standalone -d slots1337dead.look1337amfbqotlamblz911.ru
```

В `docker-compose.yml` смонтирован `nginx/slots.conf` и `/etc/letsencrypt`.

### 4. Подготовить каталоги

```bash
mkdir -p backups nginx/html
chmod +x deploy.sh backup.sh scripts/wait-for-postgres.sh
```

### 5. Запустить всё

```bash
./deploy.sh
```

Или по шагам:

```bash
# 1. Инфра (сеть slots-net создаётся здесь)
docker compose --env-file .env up -d

# 2–4. Три backend-процесса (образ один, APP_ROLE разный)
docker compose -f docker-compose.auth.yml --env-file .env up -d --build
docker compose -f docker-compose.slots.yml --env-file .env up -d --build
docker compose -f docker-compose.payments.yml --env-file .env up -d --build

# 5. Nginx после смены конфига
docker compose restart nginx
```

### 6. Проверить

```bash
docker ps --filter name=slots-

curl -s http://127.0.0.1:4001/api/health    # {"ok":true,"role":"auth"}
curl -s http://127.0.0.1:4002/health        # {"ok":true,"role":"slots"}
curl -s http://127.0.0.1:4003/api/health    # {"ok":true,"role":"payments"}

docker logs slots-auth --tail 30
docker logs slots-mobule --tail 30
docker logs slots-payments --tail 30
```

---

## Обновление кода

```bash
cd /opt/shark_slots
git pull

# Пересобрать все три backend-а (один Dockerfile)
docker compose -f docker-compose.auth.yml --env-file .env up -d --build
docker compose -f docker-compose.slots.yml --env-file .env up -d --build
docker compose -f docker-compose.payments.yml --env-file .env up -d --build
```

Или только один сервис:

```bash
# Только логin
docker compose -f docker-compose.auth.yml --env-file .env up -d --build

# Только слоты
docker compose -f docker-compose.slots.yml --env-file .env up -d --build

# Только платежи
docker compose -f docker-compose.payments.yml --env-file .env up -d --build
```

После смены `nginx/slots.conf`:

```bash
docker exec slots-nginx nginx -t
docker compose restart nginx
```

---

## Операции

### Логи

```bash
docker logs -f slots-auth
docker logs -f slots-mobule
docker logs -f slots-payments
docker logs -f slots-nginx
```

### Перезапуск одного сервиса

```bash
docker restart slots-auth
docker restart slots-mobule
docker restart slots-payments
```

### Остановка

```bash
# Только backend-ы
docker compose -f docker-compose.auth.yml down
docker compose -f docker-compose.slots.yml down
docker compose -f docker-compose.payments.yml down

# Инфра
docker compose down
```

> Не используйте `--remove-orphans` при остановке одного backend-compose — удалятся postgres/redis.

### Изменить `.env`

```bash
nano .env
docker compose -f docker-compose.auth.yml --env-file .env up -d --force-recreate
docker compose -f docker-compose.slots.yml --env-file .env up -d --force-recreate
docker compose -f docker-compose.payments.yml --env-file .env up -d --force-recreate
```

---

## Локальная разработка

```bash
npm install
# APP_ROLE=all — один процесс со всеми модулями (по умолчанию без APP_ROLE)
npm run start:dev
```

| Команда | Действие |
|---------|----------|
| `npm run compose:infra` | Postgres, Redis, Nginx |
| `npm run compose:auth` | Только auth |
| `npm run compose:slots` | Только mobule |
| `npm run compose:payments` | Только Crypto Pay |
| `npm run compose:backends` | Все три backend-а |

---

## Auth (Telegram + Google)

| Документ | Содержание |
|----------|------------|
| [docs/AUTH-setup-checklist.md](./docs/AUTH-setup-checklist.md) | `.env`, nginx, Google Console |
| [docs/TZ-auth-main-backend.md](./docs/TZ-auth-main-backend.md) | Правки main backend |

---

## Частые проблемы

| Симптом | Что проверить |
|---------|----------------|
| 404 на `/auth/recaptcha` | `nginx/slots.conf`: `location ^~ /auth/` → `:4001`; `docker compose restart nginx` |
| Mobule 502 | `curl http://127.0.0.1:4002/health`; логи `slots-mobule` |
| Crypto Pay не доходит до main | `curl http://127.0.0.1:4003/api/health`; `MAIN_APP_URL`, `INTERNAL_WEBHOOK_SECRET` |
| Auth env validation error | В `.env` есть `GOOGLE_*`, `RECAPTCHA_*`, `BOT_TOKEN`, `CORS_*` |
| `P1000` Postgres | Креды ≠ том `postgres_data` |
| Main DB недоступна | Логи `slots-auth` / `slots-mobule` |

---

## Документация

- [AGENTS.md](./AGENTS.md) — архитектура, Mobule, env
- [docs/](./docs/) — Crypto Pay, auth, чеклисты
