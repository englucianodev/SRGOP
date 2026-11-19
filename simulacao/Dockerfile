# Imagem oficial do Playwright: já traz Node.js e o Chromium com as dependências do sistema.
# A versão precisa ser a mesma do pacote "playwright" no package.json.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    TZ=America/Fortaleza

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY config ./config

CMD ["node", "src/cli/run.js"]
