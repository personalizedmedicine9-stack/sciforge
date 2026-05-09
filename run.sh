#!/bin/bash
cd /home/z/my-project/sciforge-live
while true; do
  node serve.js
  echo "Server crashed, restarting in 2s..."
  sleep 2
done
