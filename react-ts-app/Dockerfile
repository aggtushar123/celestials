# The ingress container of the Cloud Run `web` service: nginx serves the built
# SPA on :8080 and proxies /api, /ws, /admin and /static to the Django sidecar
# (Daphne on 127.0.0.1:8000, same instance). One origin for the app, the API
# and the WebSockets, so no CORS. VITE_API_URL stays empty: apiClient.ts and
# socket.ts then use window.location.origin.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# SOC2:SEC-05 unprivileged image: runs as uid 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29.2-alpine
# A template: the entrypoint fills in ${PUBLIC_HOST} and writes conf.d/default.conf.
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
