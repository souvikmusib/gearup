#!/bin/bash
set -e
if grep -rEn "new Date\([^)]+\)\.(toLocaleDateString|toLocaleTimeString|toLocaleString)" --include='*.tsx' apps/web/src/app \
  | grep -v "timeZone\|Asia/Kolkata"; then
  echo "❌ Use formatIST/formatTimeIST from src/lib/time.ts instead of raw toLocale*() without timeZone"
  exit 1
fi
echo "✅ Timezone lint passed"
