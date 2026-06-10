#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$*"
  if [ -n "${LOG_FILE:-}" ] && [ -f "$LOG_FILE" ]; then
    echo "---- app launch log ----"
    tail -n 80 "$LOG_FILE" || true
    echo "------------------------"
  fi
  exit 1
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "macOS app launch smoke must run on macOS."
fi

APP_BUNDLE="${1:-src-tauri/target/release/bundle/macos/MobausStudio.app}"
INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"
[ -f "$INFO_PLIST" ] || fail "Missing Info.plist: $INFO_PLIST"

EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$INFO_PLIST" 2>/dev/null || true)"
[ -n "$EXECUTABLE" ] || fail "CFBundleExecutable is empty."

EXECUTABLE_PATH="$APP_BUNDLE/Contents/MacOS/$EXECUTABLE"
[ -x "$EXECUTABLE_PATH" ] || fail "Bundle executable is missing or not executable: $EXECUTABLE_PATH"

CONTROL_APP="${CONTROL_APP:-/System/Applications/Calculator.app}"
CONTROL_LOG="$(mktemp "${TMPDIR:-/tmp}/mobausstudio-control-open.XXXXXX.log")"
APP_OPEN_LOG="$(mktemp "${TMPDIR:-/tmp}/mobausstudio-app-open.XXXXXX.log")"
SMOKE_WAIT_SECONDS="${SMOKE_WAIT_SECONDS:-6}"
APP_PIDS=""

cleanup() {
  if [ -n "$APP_PIDS" ]; then
    kill $APP_PIDS 2>/dev/null || true
  fi
  osascript -e 'tell application "Calculator" to quit' >/dev/null 2>&1 || true
  rm -f "$CONTROL_LOG" "$APP_OPEN_LOG"
}
trap cleanup EXIT

if [ -d "$CONTROL_APP" ]; then
  if ! open -n "$CONTROL_APP" >"$CONTROL_LOG" 2>&1; then
    echo "::warning::LaunchServices GUI open is unavailable on this host; skipping macOS app open smoke."
    echo "Control app: $CONTROL_APP"
    tail -n 20 "$CONTROL_LOG" || true
    exit 0
  fi
  sleep 1
fi

if ! open -n "$APP_BUNDLE" >"$APP_OPEN_LOG" 2>&1; then
  fail "LaunchServices failed to open app bundle: $APP_BUNDLE"
fi

sleep "$SMOKE_WAIT_SECONDS"

if command -v pgrep >/dev/null 2>&1; then
  APP_PIDS="$(pgrep -f "$EXECUTABLE_PATH" 2>/dev/null || true)"
fi

if [ -z "$APP_PIDS" ]; then
  fail "LaunchServices opened without an error, but no MobausStudio process was detected."
fi

if [ "${SMOKE_CAPTURE_SCREENSHOT:-0}" = "1" ]; then
  SCREENSHOT_PATH="${SMOKE_SCREENSHOT_PATH:-/tmp/mobausstudio-app-open-smoke.png}"
  if /usr/sbin/screencapture -x "$SCREENSHOT_PATH"; then
    echo "  screenshot: $SCREENSHOT_PATH"
  else
    echo "::warning::Screenshot capture failed on this host."
  fi
fi

echo "Verified macOS app LaunchServices smoke:"
echo "  bundle: $APP_BUNDLE"
echo "  executable: $EXECUTABLE"
echo "  pids: $APP_PIDS"
