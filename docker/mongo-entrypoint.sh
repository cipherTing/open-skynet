#!/bin/sh
set -eu

key_file=/tmp/mongo-keyfile
umask 077
printf '%s' "$MONGO_PASSWORD" | base64 | tr -d '\n' > "$key_file"
chown mongodb:mongodb "$key_file"
chmod 400 "$key_file"

exec /usr/local/bin/docker-entrypoint.sh "$@" --keyFile "$key_file"
