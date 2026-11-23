FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY site.css /usr/share/nginx/html/site.css
COPY language.js /usr/share/nginx/html/language.js
COPY orbit.js /usr/share/nginx/html/orbit.js
COPY workflow.js /usr/share/nginx/html/workflow.js
COPY research-dial.js /usr/share/nginx/html/research-dial.js
COPY review.css /usr/share/nginx/html/review.css
COPY logo-animation.css /usr/share/nginx/html/logo-animation.css
COPY assets /usr/share/nginx/html/assets
COPY signup /usr/share/nginx/html/signup
COPY learn-more /usr/share/nginx/html/learn-more
COPY pricing /usr/share/nginx/html/pricing
COPY coming-soon /usr/share/nginx/html/coming-soon
COPY admin /usr/share/nginx/html/admin
COPY workspace /usr/share/nginx/html/workspace
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
