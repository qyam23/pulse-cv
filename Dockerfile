# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Final stage
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/intelligence ./intelligence

EXPOSE 7860
ENV NODE_ENV=production
ENV PORT=7860
ENV AI_PROVIDER=huggingface
ENV HF_MODEL=Qwen/Qwen3-32B
CMD ["npm", "start"]
