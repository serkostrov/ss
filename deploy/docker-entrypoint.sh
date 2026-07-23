#!/bin/sh
set -eu

TEMPLATE="/etc/nginx/templates-custom/env.template.js"
TARGET="/usr/share/nginx/html/env.js"

# Runtime env from Dokploy (or docker -e). Optional trailing slash strip on APP_URL not needed.
: "${VITE_SUPABASE_URL:=}"
: "${VITE_SUPABASE_ANON_KEY:=}"
: "${VITE_APP_URL:=}"

if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "ERROR: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as container environment variables." >&2
  echo "In Dokploy: Application → Environment (runtime). Rebuild is not enough if these were only missing at run." >&2
  exit 1
fi

# Default public URL to current host if omitted (left empty → SPA uses window.location.origin)
if [ -z "$VITE_APP_URL" ]; then
  VITE_APP_URL=""
fi

export VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_APP_URL

# Only substitute our vars so `$` elsewhere is untouched
envsubst '${VITE_SUPABASE_URL} ${VITE_SUPABASE_ANON_KEY} ${VITE_APP_URL}' \
  < "$TEMPLATE" > "$TARGET"

echo "Wrote runtime env to $TARGET"
exec nginx -g 'daemon off;'
