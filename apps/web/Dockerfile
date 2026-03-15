FROM node:20-alpine AS builder

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN npm install -g serve

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

USER appuser

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
