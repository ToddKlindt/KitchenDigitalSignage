FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY web ./web
RUN mkdir -p /app/data && chown node:node /app/data
ENV TZ=America/Chicago
ENV DATA_DIR=/app/data
USER node
EXPOSE 8080
CMD ["node", "server/http.mjs"]
