# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Final stage
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
# Copy other source files needed by tsx in production if necessary
# Or use a safer approach: pre-compile server.ts
COPY . .

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
