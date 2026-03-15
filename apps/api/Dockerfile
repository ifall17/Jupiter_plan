FROM node:20-alpine AS builder

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npx prisma generate
RUN npm run build

USER appuser

FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

USER appuser

EXPOSE 3001

CMD ["node", "dist/main.js"]
