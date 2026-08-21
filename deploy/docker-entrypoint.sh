#!/bin/sh
set -eu

INDEX_HTML="/usr/share/nginx/html/index.html"
NGINX_CONF="/etc/nginx/conf.d/default.conf"
export INDEX_HTML

# Runtime env from Dokploy (or docker -e). Optional trailing slash strip on APP_URL not needed.
: "${VITE_SUPABASE_URL:=}"
: "${VITE_SUPABASE_ANON_KEY:=}"
: "${VITE_APP_URL:=}"
: "${VITE_TELEGRAM_BOT_URL:=}"
: "${VITE_MAX_BOT_URL:=}"
: "${VITE_MESSENGER_API_URL:=}"
: "${MESSENGER_UPSTREAM:=}"

if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "ERROR: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as container environment variables." >&2
  echo "In Dokploy: Application → Environment (runtime). Rebuild is not enough if these were only missing at run." >&2
  exit 1
fi

# Default public URL to current host if omitted (left empty → SPA uses window.location.origin)
if [ -z "$VITE_APP_URL" ]; then
  VITE_APP_URL=""
fi

export VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_APP_URL VITE_TELEGRAM_BOT_URL VITE_MAX_BOT_URL VITE_MESSENGER_API_URL

# Inline runtime env into index.html — do not write a public /env.js file.
node <<'NODE'
const fs = require('fs')
const indexPath = process.env.INDEX_HTML || '/usr/share/nginx/html/index.html'
const marker = '<!--RUNTIME_ENV-->'
const env = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
  VITE_APP_URL: process.env.VITE_APP_URL || '',
  VITE_TELEGRAM_BOT_URL: process.env.VITE_TELEGRAM_BOT_URL || '',
  VITE_MAX_BOT_URL: process.env.VITE_MAX_BOT_URL || '',
  VITE_MESSENGER_API_URL: process.env.VITE_MESSENGER_API_URL || '',
}
const html = fs.readFileSync(indexPath, 'utf8')
if (!html.includes(marker)) {
  console.error('index.html is missing <!--RUNTIME_ENV--> marker')
  process.exit(1)
}
const script = `<script>window.__ENV__=${JSON.stringify(env)};</script>`
fs.writeFileSync(indexPath, html.replace(marker, script))
NODE

rm -f /usr/share/nginx/html/env.js /usr/share/nginx/html/env.js.map
echo "Inlined runtime env into $INDEX_HTML (env.js not published)"

# Optional: proxy /webhooks/* and override /api/messenger/* to messenger worker.
# Uses a variable + Docker DNS resolver so nginx can start even if messenger is not up yet.
if [ -n "$MESSENGER_UPSTREAM" ]; then
  webhook_block=$(cat <<EOF
  # Messenger worker webhooks (Telegram / Max)
  location /webhooks/ {
    resolver 127.0.0.11 valid=10s ipv6=off;
    set \$messenger_upstream "${MESSENGER_UPSTREAM}";
    proxy_pass \$messenger_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 30s;
  }

  # Messenger outbound API (admin send from SPA) — overrides stub in nginx.conf
  location /api/messenger/ {
    resolver 127.0.0.11 valid=10s ipv6=off;
    set \$messenger_upstream "${MESSENGER_UPSTREAM}";
    rewrite ^/api/messenger/(.*) /\$1 break;
    proxy_pass \$messenger_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Authorization \$http_authorization;
    client_max_body_size 12m;
    proxy_read_timeout 60s;
  }

EOF
)
  tmp=$(mktemp)
  # Remove the stub /api/messenger/ block, then inject proxy locations before SPA.
  awk '
    BEGIN { skip=0 }
    /# Messenger outbound stub/ { skip=1; next }
    skip && /^  # Optional messenger webhook/ { skip=0 }
    skip { next }
    { print }
  ' "$NGINX_CONF" > "$tmp"
  mv "$tmp" "$NGINX_CONF"

  tmp=$(mktemp)
  awk -v block="$webhook_block" '
    /# SPA: React Router/ && !done {
      printf "%s", block
      done=1
    }
    { print }
  ' "$NGINX_CONF" > "$tmp"
  mv "$tmp" "$NGINX_CONF"
  echo "Enabled /webhooks/ and /api/messenger/ proxy → $MESSENGER_UPSTREAM"
else
  echo "MESSENGER_UPSTREAM empty — use VITE_MESSENGER_API_URL for outbound (separate messenger domain)."
fi

# FNS INN lookup (same-origin /api/company-by-inn via nginx)
node /opt/inn-lookup-server.mjs &
INN_LOOKUP_PID=$!

cleanup() {
  kill "$INN_LOOKUP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec nginx -g 'daemon off;'
