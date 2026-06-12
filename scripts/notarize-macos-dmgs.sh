#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$*"
  exit 1
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "macOS DMG notarization must run on macOS."
fi

TARGET_TRIPLE="${1:-${TAURI_TARGET_TRIPLE:-}}"
RELEASE_TAG="${2:-${RELEASE_TAG:-}}"
TARGET_ROOT="${MACOS_DISTRIBUTION_ROOT:-src-tauri/target}"

if [ -z "${APPLE_ID:-}" ]; then
  fail "APPLE_ID is required to notarize macOS DMG artifacts."
fi

if [ -z "${APPLE_PASSWORD:-}" ]; then
  fail "APPLE_PASSWORD is required to notarize macOS DMG artifacts."
fi

if [ -z "${APPLE_TEAM_ID:-}" ]; then
  fail "APPLE_TEAM_ID is required to notarize macOS DMG artifacts."
fi

SEARCH_ROOTS=()
if [ -n "$TARGET_TRIPLE" ]; then
  SEARCH_ROOTS+=("$TARGET_ROOT/$TARGET_TRIPLE/release/bundle")
else
  SEARCH_ROOTS+=("$TARGET_ROOT/release/bundle")
  while IFS= read -r candidate; do
    SEARCH_ROOTS+=("$candidate")
  done < <(find "$TARGET_ROOT" -mindepth 3 -maxdepth 3 -type d -path '*/release/bundle' 2>/dev/null | sort)
fi

EXISTING_ROOTS=()
for root in "${SEARCH_ROOTS[@]}"; do
  if [ -d "$root" ]; then
    EXISTING_ROOTS+=("$root")
  fi
done

if [ "${#EXISTING_ROOTS[@]}" -eq 0 ]; then
  if [ -n "$TARGET_TRIPLE" ]; then
    fail "No macOS bundle root found for target '$TARGET_TRIPLE' under $TARGET_ROOT."
  fi
  fail "No macOS bundle root found under $TARGET_ROOT."
fi

DMGS=()
for root in "${EXISTING_ROOTS[@]}"; do
  while IFS= read -r -d '' dmg; do
    DMGS+=("$dmg")
  done < <(find "$root" -type f -name '*.dmg' -print0)
done

if [ "${#DMGS[@]}" -eq 0 ]; then
  fail "No .dmg artifact found under: ${EXISTING_ROOTS[*]}"
fi

for dmg in "${DMGS[@]}"; do
  echo "Notarizing macOS DMG: $dmg"
  if ! submit_output="$(xcrun notarytool submit "$dmg" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait 2>&1)"; then
    printf '%s\n' "$submit_output"
    fail "Failed to notarize macOS DMG: $dmg"
  fi
  printf '%s\n' "$submit_output"

  echo "Stapling macOS DMG: $dmg"
  if ! staple_output="$(xcrun stapler staple "$dmg" 2>&1)"; then
    printf '%s\n' "$staple_output"
    fail "Failed to staple macOS DMG: $dmg"
  fi
  printf '%s\n' "$staple_output"

  if [ -n "$RELEASE_TAG" ]; then
    echo "Uploading stapled macOS DMG to release $RELEASE_TAG: $dmg"
    gh release upload "$RELEASE_TAG" "$dmg" --clobber
  fi
done
