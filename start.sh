#!/bin/bash
# Kill processes on ports 3000, 3001, and 4000
for port in 3000 3001 4000; do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "Killing process on port $port (PID: $pid)"
    kill -9 $pid 2>/dev/null
  fi
done

sleep 1
echo "Starting GearUp Servicing..."
pnpm dev
