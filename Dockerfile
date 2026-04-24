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
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/intelligence ./intelligence
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/requirements-doc-worker.txt ./requirements-doc-worker.txt
RUN python3 -m pip install --no-cache-dir -r requirements-doc-worker.txt

EXPOSE 7860
ENV NODE_ENV=production
ENV PORT=7860
ENV AI_PROVIDER=huggingface
ENV HF_MODEL=Qwen/Qwen3-32B
ENV ENABLE_CV_APPLY_RECOMMENDATIONS=true
ENV ENABLE_DOCX_PATCH_PIPELINE=true
ENV ENABLE_PDF_PATCH_PIPELINE=true
ENV ENABLE_CHANGE_REPORT=true
CMD ["npm", "start"]
