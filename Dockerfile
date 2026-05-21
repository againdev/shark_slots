FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

RUN npx prisma generate --schema prisma/main/schema.prisma \
  && npx prisma generate --schema prisma/local/schema.prisma \
  && npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl ca-certificates netcat-openbsd && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY scripts/wait-for-postgres.sh ./scripts/wait-for-postgres.sh
RUN chmod +x ./scripts/wait-for-postgres.sh

EXPOSE 4001

CMD ["sh", "-c", "./scripts/wait-for-postgres.sh && npm run start:push:local:prod"]
