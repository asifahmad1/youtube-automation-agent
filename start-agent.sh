#!/bin/bash
# start-agent.sh — double-click (or run: bash start-agent.sh) to run Asif-YouTube-Agent.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed on this computer."
  echo "Please install it first: see SETUP-GUIDE.md, step 1 (https://nodejs.org, LTS)."
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing the needed packages. This takes a minute..."
  npm install || { echo "The install did not finish. Check your internet connection and try again."; read -p "Press Enter to close..."; exit 1; }
fi

node index.js
echo
read -p "Press Enter to close..."
