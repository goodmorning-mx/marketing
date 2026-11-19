FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY language.js /usr/share/nginx/html/language.js
COPY assets /usr/share/nginx/html/assets
COPY signup /usr/share/nginx/html/signup
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
