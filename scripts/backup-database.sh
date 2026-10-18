#!/usr/bin/env bash
set -euo pipefail
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL outside source control}"
umask 077
mkdir -p backups
backup="backups/checksquare-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-acl --file="$backup"
pg_restore --list "$backup" > /dev/null
sha256sum "$backup" > "$backup.sha256"
echo "Verified database archive: $backup"
echo 'This archive does not include Storage object bytes. Back up private bucket contents separately.'
