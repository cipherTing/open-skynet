#!/bin/sh
set -eu

retries=60
authentication_failures=0
last_error=''

while [ "$retries" -gt 0 ]; do
  if output="$(mongosh --host mongo:27017 --username "$MONGO_USERNAME" --password "$MONGO_PASSWORD" --authenticationDatabase admin --quiet --eval 'db.adminCommand({ ping: 1 }).ok' 2>&1)"; then
    authentication_failures=0
    if printf '%s\n' "$output" | grep -q 1; then
      exec mongosh --host mongo:27017 --username "$MONGO_USERNAME" --password "$MONGO_PASSWORD" --authenticationDatabase admin --quiet /docker/mongo-init.js
    fi
  else
    last_error="$output"
    if printf '%s\n' "$output" | grep -Eq 'Authentication failed|AuthenticationFailed|UserNotFound'; then
      authentication_failures=$((authentication_failures + 1))
      if [ "$authentication_failures" -ge 3 ]; then
        echo 'MongoDB authentication failed. Check the configured credentials or recreate a data volume created before authentication was enabled.' >&2
        printf '%s\n' "$last_error" >&2
        exit 1
      fi
    else
      authentication_failures=0
    fi
  fi

  retries=$((retries - 1))
  sleep 1
done

echo 'MongoDB did not become ready before replica set initialization.' >&2
if [ -n "$last_error" ]; then
  printf '%s\n' "$last_error" >&2
fi
exit 1
