# ---- Stage 1: build the Vite bundle -------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# VITE_API_BASE is baked into the JS bundle at build time. Set this in
# Dokploy → Environment → Build Args (or Environment Variables) so the
# built site knows where to reach the backend.
#   VITE_API_BASE=https://<your-backend-domain>
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Stage 2: serve the built assets ------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
