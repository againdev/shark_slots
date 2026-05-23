# shark_slots

Callback-сервер для Shark: Mobule (слоты), прокси webhook Crypto Pay → основной бэкенд.  
Две БД: локальная PostgreSQL (`SlotSpins`) + удалённая main (`MAIN_DATABASE_URL`).

Подробная архитектура — в [AGENTS.md](./AGENTS.md).

---

## Стек на сервере

Продакшен разбит на **два Docker Compose-стека** в одной сети `slots-net`:

| Стек | Файл | Контейнеры |
|------|------|------------|
| **1 — инфра** | `docker-compose.yml` | `slots-postgres`, `slots-redis`, `slots-adminer`, `slots-postgres-backup`, `slots-nginx` |
| **2 — backend** | `docker-compose.backend.yml` | `slots-backend` → `127.0.0.1:4001` |

```text
Internet ──► slots-nginx (host :80/:443)
                 │
                 ▼
            127.0.0.1:4001 ──► slots-backend
                 │
     slots-net ──┼──► slots-postgres  (DATABASE_URL)
                 └──► slots-redis     (REDIS_PASSWORD)
                 
slots-backend ──► MAIN_DATABASE_URL (удалённый Postgres Shark)
              ──► MAIN_APP_URL      (forward Crypto Pay)
```

> `.env` **не попадает в Docker-образ** (см. `.dockerignore`). Секреты читаются с диска сервера при `docker compose up`.

---

## Требования на сервере

- Linux, Docker Engine + Compose v2
- Git
- Домен и сертификат Let's Encrypt (для HTTPS)
- Порты: **80**, **443** (nginx); **4001** только на localhost

```bash
docker --version
docker compose version
```

---

## Первый деплой

### 1. Клонировать репозиторий

```bash
cd /opt   # или любая директория
git clone https://github.com/againdev/shark_slots.git
cd shark_slots
```

Убедитесь, что в репозитории есть актуальный **`package-lock.json`** (нужен для `npm ci` в Dockerfile).

### 2. Создать `.env`

```bash
nano .env
```

| Переменная | Назначение |
|------------|------------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Локальная БД в `slots-postgres` (только при **первом** создании тома) |
| `DATABASE_URL` | `postgresql://USER:PASS@slots-postgres:5432/postgres` |
| `MAIN_DATABASE_URL` | БД основного Shark (удалённый хост) |
| `REDIS_HOST` | `slots-redis` |
| `REDIS_PORT` | `6379` |
| `REDIS_PASSWORD` | Тот же пароль, что у Redis в `docker-compose.yml` |
| `MAIN_APP_URL` | URL основного сайта |
| `INTERNAL_WEBHOOK_SECRET` | Общий секрет с main backend |
| `CRYPTO_BOT_API_TOKEN` | Crypto Pay API token |
| `MOBULE_SECRET_TOKEN` | Mobule |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `EXPIRES_IN_*` | JWT |
| `CORS_*` | CORS для API |

### 3. SSL и nginx (прод)

Сертификат на хосте:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d slotsidback.fun -d www.slotsidback.fun
```

В `docker-compose.yml` для прода укажите **`nginx/slots.conf`** (не `slots.test.conf`):

```yaml
volumes:
  - ./nginx/slots.conf:/etc/nginx/conf.d/default.conf:ro
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 4. Подготовить каталоги

```bash
mkdir -p backups nginx/html
chmod +x deploy.sh backup.sh scripts/wait-for-postgres.sh
```

### 5. Запустить

```bash
./deploy.sh
```

Или вручную:

```bash
docker compose --env-file .env up -d
docker compose -f docker-compose.backend.yml --env-file .env up -d --build
```

### 6. Проверить

```bash
docker ps --filter name=slots-
curl -s http://127.0.0.1:4001/api
docker logs slots-backend --tail 50
```

При недоступной main DB backend **всё равно стартует** и раз в 10 с пишет в лог попытку переподключения; Mobule-колбэки до подключения отвечают `503`.

---

## Операции на сервере

Все команды — из каталога проекта (`~/slots` и т.п.).

### Статус

```bash
docker ps --filter name=slots-
```

### Логи

```bash
# весь стек инфра
docker compose logs -f

# один сервис (имя из compose-файла, не container_name)
docker compose logs -f postgres
docker compose logs -f nginx

# backend (второй compose-файл)
docker compose -f docker-compose.backend.yml logs -f

# по имени контейнера
docker logs -f slots-backend
docker logs -f slots-postgres
docker logs -f slots-redis
docker logs -f slots-nginx
```

> `slots-net` — это **сеть**, не сервис: `docker compose logs slots-net` не сработает.

---

### Перезапуск

| Что нужно | Команда |
|-----------|---------|
| **Только backend** (код, без пересборки) | `docker compose -f docker-compose.backend.yml --env-file .env restart` |
| **Backend с пересборкой** | `docker compose -f docker-compose.backend.yml --env-file .env up -d --build` |
| **Postgres** | `docker compose restart postgres` |
| **Redis** | `docker compose restart redis` |
| **Nginx** (после смены конфига) | `docker compose restart nginx` |
| **Adminer** | `docker compose restart adminer` |
| **Вся инфра** | `docker compose --env-file .env up -d` |
| **Всё с нуля (оба стека)** | `./deploy.sh` |

Перезапуск одного контейнера по имени:

```bash
docker restart slots-backend
docker restart slots-nginx
```

---

### Обновить код backend

```bash
git pull
docker compose -f docker-compose.backend.yml --env-file .env up -d --build
docker logs -f slots-backend
```

---

### Изменить `.env`

1. Отредактировать `.env` на сервере.
2. Пересоздать контейнер backend (переменные подхватываются при старте):

```bash
docker compose -f docker-compose.backend.yml --env-file .env up -d --force-recreate
```

Если меняли **`POSTGRES_*`** или **`REDIS_PASSWORD`** для уже работающих контейнеров:

- **Postgres:** пароль в `.env` не меняет существующий том — нужны старые креды или удаление volume (см. ниже).
- **Redis:** после смены пароля в compose — `docker compose up -d --force-recreate redis` и тот же пароль в `.env` для backend.

---

### Сменить конфиг nginx

1. Правите `nginx/slots.conf` или `nginx/slots.test.conf`.
2. Убедитесь, что в `docker-compose.yml` смонтирован нужный файл.
3. Перезапуск:

```bash
docker compose restart nginx
# или
docker restart slots-nginx
```

Проверка конфига:

```bash
docker exec slots-nginx nginx -t
```

---

### Остановить

```bash
# только backend
docker compose -f docker-compose.backend.yml down

# инфра (postgres, redis, nginx, …)
docker compose down

# всё (backend сначала, потом инфра)
docker compose -f docker-compose.backend.yml down
docker compose down
```

> Не используйте `--remove-orphans` при остановке **только backend** — иначе удалятся postgres/redis из первого стека.

---

## Частые проблемы

| Симптом | Что проверить |
|---------|----------------|
| `P1000` Postgres | Креды в `.env` ≠ те, под которыми создан том `slots_postgres_data` |
| `NOAUTH` Redis | `REDIS_PASSWORD` в `.env` и в URL приложения |
| `npm ci` при build | Закоммичен ли `package-lock.json` после `npm install` |
| WARN `orphan containers` | Нормально при запуске второго compose-файла |
| Backend не отвечает с nginx | `curl http://127.0.0.1:4001/api`; `APP_ADDRESS=0.0.0.0` в backend compose |
| Main DB недоступна | Логи `slots-backend`, firewall/`pg_hba` на хосте main |
| Nginx: published ports discarded | Нормально при `network_mode: host` |

### Сброс локальной БД (данные SlotSpins удалятся)

```bash
docker compose -f docker-compose.backend.yml down
docker compose down
docker volume rm slots_postgres_data   # имя: docker volume ls | grep postgres
docker compose --env-file .env up -d
docker compose -f docker-compose.backend.yml --env-file .env up -d --build
```

---

## Локальная разработка

```bash
npm install
cp .env.example .env   # если есть; иначе скопируйте .env вручную
npm run compose:dev    # postgres, redis, app, nginx
# или
npm run start:dev      # Nest без Docker app
```

| Команда | Действие |
|---------|----------|
| `npm run compose:dev` | Полный dev-стек |
| `npm run compose:dev:down` | Остановить dev-стек |
| `npm run compose:infra` | Только инфра (как на сервере) |
| `npm run compose:backend` | Только backend |

---

## Полезные npm-скрипты

| Скрипт | Описание |
|--------|----------|
| `npm run build` | Сборка Nest |
| `npm run start:prod` | Запуск `dist/main` |
| `npm run start:push:local:prod` | `prisma db push` (local) + prod |

---

## Auth (Telegram Login Widget + Google)

Логика выполняется на **shark_slots** (без Telegram Mini App / `authenticate` initData); для пользователя URL остаются на **основном домене** (nginx main проксирует `/auth/google/` на slots).

| Документ | Содержание |
|----------|------------|
| [docs/AUTH-setup-checklist.md](./docs/AUTH-setup-checklist.md) | Что добавить в `.env`, nginx, Google Console |
| [docs/TZ-auth-main-backend.md](./docs/TZ-auth-main-backend.md) | ТЗ для Cursor: правки `fullstack/shark/backend` |

---

## Документация

- [AGENTS.md](./AGENTS.md) — архитектура, Mobule, env, техдолг
- [docs/](./docs/) — Crypto Pay, auth, чеклисты
