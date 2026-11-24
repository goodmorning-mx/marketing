FROM nginx:1.27-alpine

ENV NGINX_ENVSUBST_FILTER=VITE_API_URL
ENV VITE_API_URL=https://api.dev.marketing.goodmorning.mx

COPY index.html /usr/share/nginx/html/index.html
COPY site.css /usr/share/nginx/html/site.css
COPY language.js /usr/share/nginx/html/language.js
COPY auth.js /usr/share/nginx/html/auth.js
COPY login.js /usr/share/nginx/html/login.js
COPY account-flow.js /usr/share/nginx/html/account-flow.js
COPY activate.js /usr/share/nginx/html/activate.js
COPY account.css /usr/share/nginx/html/account.css
COPY orbit.js /usr/share/nginx/html/orbit.js
COPY workflow.js /usr/share/nginx/html/workflow.js
COPY research-dial.js /usr/share/nginx/html/research-dial.js
COPY review.css /usr/share/nginx/html/review.css
COPY logo-animation.css /usr/share/nginx/html/logo-animation.css
COPY logo-animation.js /usr/share/nginx/html/logo-animation.js
COPY assets /usr/share/nginx/html/assets
COPY signup /usr/share/nginx/html/signup
COPY learn-more /usr/share/nginx/html/learn-more
COPY pricing /usr/share/nginx/html/pricing
COPY coming-soon /usr/share/nginx/html/coming-soon
COPY admin /usr/share/nginx/html/admin
COPY login /usr/share/nginx/html/login
COPY register /usr/share/nginx/html/register
COPY verify-email /usr/share/nginx/html/verify-email
COPY forgot-password /usr/share/nginx/html/forgot-password
COPY reset-password /usr/share/nginx/html/reset-password
COPY activate /usr/share/nginx/html/activate
COPY workspace /usr/share/nginx/html/workspace
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
