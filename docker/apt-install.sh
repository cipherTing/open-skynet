#!/bin/sh
set -eu

for attempt in 1 2 3; do
  if apt-get -o Acquire::Retries=3 update -y && \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends "$@"; then
    rm -rf /var/lib/apt/lists/*
    exit 0
  fi

  if [ "$attempt" = 3 ]; then
    exit 1
  fi

  rm -rf /var/lib/apt/lists/*
  sleep "$attempt"
done
