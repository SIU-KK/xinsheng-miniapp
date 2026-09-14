FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
# Prefer npm; if no package-lock, generate one with npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build
ENV PORT=7860
EXPOSE 7860
CMD ["npm", "start"]
