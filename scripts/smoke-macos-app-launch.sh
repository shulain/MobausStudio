#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$*"
  if [ -n "${APP_OPEN_LOG:-}" ] && [ -f "$APP_OPEN_LOG" ]; then
    echo "---- app launch log ----"
    tail -n 120 "$APP_OPEN_LOG" || true
    echo "------------------------"
  fi
  if [ -n "${CONTROL_LOG:-}" ] && [ -f "$CONTROL_LOG" ]; then
    echo "---- control open log ----"
    tail -n 40 "$CONTROL_LOG" || true
    echo "--------------------------"
  fi
  if [ -n "${PGREP_LOG:-}" ] && [ -f "$PGREP_LOG" ]; then
    echo "---- process detection log ----"
    tail -n 40 "$PGREP_LOG" || true
    echo "-------------------------------"
  fi
  exit 1
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "macOS app launch smoke must run on macOS."
fi

APP_BUNDLE_INPUT="${1:-src-tauri/target/release/bundle/macos/MobausStudio.app}"
[ -d "$APP_BUNDLE_INPUT" ] || fail "Missing app bundle: $APP_BUNDLE_INPUT"
APP_BUNDLE="$(cd "$APP_BUNDLE_INPUT" && pwd -P)"
INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"
[ -f "$INFO_PLIST" ] || fail "Missing Info.plist: $INFO_PLIST"

EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$INFO_PLIST" 2>/dev/null || true)"
[ -n "$EXECUTABLE" ] || fail "CFBundleExecutable is empty."

EXECUTABLE_PATH="$APP_BUNDLE/Contents/MacOS/$EXECUTABLE"
[ -x "$EXECUTABLE_PATH" ] || fail "Bundle executable is missing or not executable: $EXECUTABLE_PATH"

CONTROL_APP="${CONTROL_APP:-/System/Applications/Calculator.app}"
CONTROL_LOG="$(mktemp "${TMPDIR:-/tmp}/mobausstudio-control-open.XXXXXX.log")"
APP_OPEN_LOG="$(mktemp "${TMPDIR:-/tmp}/mobausstudio-app-open.XXXXXX.log")"
PGREP_LOG="$(mktemp "${TMPDIR:-/tmp}/mobausstudio-pgrep.XXXXXX.log")"
SMOKE_WAIT_SECONDS="${SMOKE_WAIT_SECONDS:-6}"
APP_PIDS=""
LAUNCH_MODE="launchservices"

cleanup() {
  if [ -n "$APP_PIDS" ]; then
    kill $APP_PIDS 2>/dev/null || true
  fi
  osascript -e 'tell application "Calculator" to quit' >/dev/null 2>&1 || true
  rm -f "$CONTROL_LOG" "$APP_OPEN_LOG" "$PGREP_LOG"
}
trap cleanup EXIT

list_app_pids() {
  if ! command -v pgrep >/dev/null 2>&1; then
    fail "pgrep is required for macOS app launch smoke verification."
  fi

  local output status
  set +e
  output="$(pgrep -f "$EXECUTABLE_PATH" 2>"$PGREP_LOG")"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    printf '%s\n' "$output"
  elif [ "$status" -eq 1 ]; then
    true
  else
    fail "pgrep failed while checking MobausStudio process list."
  fi
}

command_for_pid() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null || true
}

warn_same_executable_from_other_paths() {
  local output status pid command_line warned=0

  set +e
  output="$(pgrep -x "$EXECUTABLE" 2>"$PGREP_LOG")"
  status=$?
  set -e

  if [ "$status" -eq 1 ]; then
    return 0
  fi
  if [ "$status" -ne 0 ]; then
    fail "pgrep failed while checking for same-name app processes."
  fi

  for pid in $output; do
    command_line="$(command_for_pid "$pid")"
    if [ -n "$command_line" ] && [[ "$command_line" != "$EXECUTABLE_PATH"* ]]; then
      if [ "$warned" -eq 0 ]; then
        echo "::warning::Detected another $EXECUTABLE process from a different path. Desktop automation by bundle identifier can target the wrong app; this smoke test will verify only the bundle path below."
        warned=1
      fi
      echo "  otherPid: $pid"
      echo "  otherCommand: $command_line"
    fi
  done
}

verify_launched_pid_paths() {
  local pid command_line

  for pid in $APP_PIDS; do
    command_line="$(command_for_pid "$pid")"
    [ -n "$command_line" ] || fail "Unable to read command line for launched PID: $pid"

    if [[ "$command_line" != "$EXECUTABLE_PATH"* ]]; then
      fail "Detected PID $pid does not belong to the target bundle executable. Expected prefix: $EXECUTABLE_PATH; actual command: $command_line"
    fi
  done
}

new_pids_after_launch() {
  local before_pids="$1"
  local after_pids="$2"
  local pid old_pid found

  for pid in $after_pids; do
    found=0
    for old_pid in $before_pids; do
      if [ "$pid" = "$old_pid" ]; then
        found=1
        break
      fi
    done

    if [ "$found" -eq 0 ]; then
      printf '%s\n' "$pid"
    fi
  done
}

BEFORE_PIDS="$(list_app_pids)"
warn_same_executable_from_other_paths

if [ -d "$CONTROL_APP" ]; then
  if ! open -n "$CONTROL_APP" >"$CONTROL_LOG" 2>&1; then
    echo "::warning::LaunchServices control app open failed; continuing to verify the target app bundle."
    echo "Control app: $CONTROL_APP"
    tail -n 20 "$CONTROL_LOG" || true
  else
    sleep 1
  fi
fi

if ! open -n "$APP_BUNDLE" >"$APP_OPEN_LOG" 2>&1; then
  fail "LaunchServices failed to open app bundle: $APP_BUNDLE"
fi

sleep "$SMOKE_WAIT_SECONDS"

AFTER_PIDS="$(list_app_pids)"
APP_PIDS="$(new_pids_after_launch "$BEFORE_PIDS" "$AFTER_PIDS")"

if [ -z "$APP_PIDS" ]; then
  fail "LaunchServices opened without an error, but no new MobausStudio process was detected."
fi
verify_launched_pid_paths

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
echo "  executablePath: $EXECUTABLE_PATH"
echo "  launchMode: $LAUNCH_MODE"
echo "  pids: $APP_PIDS"
