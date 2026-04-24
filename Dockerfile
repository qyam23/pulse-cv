FROM node:20-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY dist ./dist
COPY server.ts ./server.ts
COPY server ./server
COPY intelligence ./intelligence
COPY scripts ./scripts
COPY requirements-doc-worker.txt ./requirements-doc-worker.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements-doc-worker.txt

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
