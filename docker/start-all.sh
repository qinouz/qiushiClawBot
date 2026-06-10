#!/bin/sh
set -eu

cd /app/qiushiClawBot
npm start &
qiushi_pid="$!"

cd /app/gold
npm run web &
gold_pid="$!"

stop_all() {
  kill "$qiushi_pid" "$gold_pid" 2>/dev/null || true
  wait "$qiushi_pid" 2>/dev/null || true
  wait "$gold_pid" 2>/dev/null || true
}

trap stop_all INT TERM

status=0
while :; do
  if ! kill -0 "$qiushi_pid" 2>/dev/null; then
    wait "$qiushi_pid" || status="$?"
    stop_all
    exit "$status"
  fi

  if ! kill -0 "$gold_pid" 2>/dev/null; then
    wait "$gold_pid" || status="$?"
    stop_all
    exit "$status"
  fi

  sleep 2
done
