### STEP 1 ###
FROM node:24-slim AS builder

WORKDIR /app

# O prisma generate precisa do openssl para escolher o schema-engine ja instalado
# em node_modules; sem ele o CLI tenta baixar o binario durante o build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json .

RUN npm ci

COPY . .

RUN npx prisma generate

RUN npm run build

# Reduz node_modules ao que roda em producao, ainda no builder:
# o que for removido aqui nunca chega a existir na imagem final.
RUN npm prune --omit=dev \
  && rm -rf \
    node_modules/prisma \
    node_modules/@prisma/dev \
    node_modules/@prisma/engines \
    node_modules/@prisma/fetch-engine \
    node_modules/@prisma/studio-core \
    node_modules/typescript \
    node_modules/effect \
  && find node_modules/@prisma/client/runtime -name '*.wasm-base64.*' ! -name '*postgresql*' -delete \
  && find node_modules -name '*.map' -delete

### STEP 2 ###
FROM node:24-slim AS production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3333

CMD [ "npm", "run", "start:prod"]
