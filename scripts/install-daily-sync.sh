#!/bin/bash
#
# Install a macOS launchd agent to run email-sync.ts every morning at 7:00 AM.
#
# Usage:
#   bash scripts/install-daily-sync.sh
#
# To uninstall:
#   launchctl unload ~/Library/LaunchAgents/com.pryluk.email-listing-sync.plist
#   rm ~/Library/LaunchAgents/com.pryluk.email-listing-sync.plist
#
# To check logs:
#   tail -f /tmp/email-listing-sync.log

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/com.pryluk.email-listing-sync.plist"

# Find absolute path to npx so launchd can exec it outside shell profile
NPX_PATH="$(command -v npx || echo /usr/local/bin/npx)"
if [ ! -x "$NPX_PATH" ]; then
  echo "❌ Could not find npx. Please install Node.js first."
  exit 1
fi

# Ensure LaunchAgents dir exists
mkdir -p "$HOME/Library/LaunchAgents"

# Write the plist
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.pryluk.email-listing-sync</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd "$PROJECT_DIR" && "$NPX_PATH" tsx --env-file=.env scripts/email-sync.ts --days 2 >> /tmp/email-listing-sync.log 2>&1</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>7</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>RunAtLoad</key>
  <false/>

  <key>StandardOutPath</key>
  <string>/tmp/email-listing-sync.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/email-listing-sync.log</string>
</dict>
</plist>
EOF

# Load it (unload first in case it was already loaded)
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "✅ Daily sync installed!"
echo ""
echo "   Project:  $PROJECT_DIR"
echo "   Schedule: Every day at 7:00 AM"
echo "   Logs:     /tmp/email-listing-sync.log"
echo ""
echo "To test it now:"
echo "   launchctl start com.pryluk.email-listing-sync"
echo ""
echo "To uninstall:"
echo "   launchctl unload $PLIST_PATH"
echo "   rm $PLIST_PATH"
