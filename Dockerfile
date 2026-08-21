FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip build-essential \
    && pip3 install edge-tts --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 8080
CMD ["node", "src/index.js"]
