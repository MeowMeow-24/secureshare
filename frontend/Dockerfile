# Build Stage
FROM node:20-alpine AS build
WORKDIR /app

# ฝัง URL ของ Backend ตอน Build
ENV VITE_API_BASE_URL=https://secureshare-production-e9a9.up.railway.app
ENV VITE_API_URL=https://secureshare-production-e9a9.up.railway.app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
