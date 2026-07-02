FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY openapi.yaml ./openapi.yaml
COPY README.md AGENT.md eslint.config.js ./

USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
