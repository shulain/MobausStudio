#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$*"
  exit 1
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "macOS distribution verification must run on macOS."
fi

TARGET_TRIPLE="${1:-${TAURI_TARGET_TRIPLE:-}}"
TARGET_ROOT="${MACOS_DISTRIBUTION_ROOT:-src-tauri/target}"

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

APPS=()
DMGS=()
for root in "${EXISTING_ROOTS[@]}"; do
  while IFS= read -r -d '' app; do
    APPS+=("$app")
  done < <(find "$root" -type d -name '*.app' -print0)

  while IFS= read -r -d '' dmg; do
    DMGS+=("$dmg")
  done < <(find "$root" -type f -name '*.dmg' -print0)
done

if [ "${#APPS[@]}" -eq 0 ]; then
  fail "No .app bundle found under: ${EXISTING_ROOTS[*]}"
fi

if [ "${#DMGS[@]}" -eq 0 ]; then
  fail "No .dmg artifact found under: ${EXISTING_ROOTS[*]}"
fi

reject_gatekeeper_override() {
  local output="$1"
  local path="$2"

  if printf '%s\n' "$output" | grep -q 'override=security disabled'; then
    fail "Gatekeeper assessment for $path is not authoritative because system security assessment is disabled."
  fi
}

verify_app() {
  local app="$1"
  local details gatekeeper_output

  codesign --verify --deep --strict --verbose=2 "$app"
  details="$(codesign -dv --verbose=4 "$app" 2>&1)"

  if printf '%s\n' "$details" | grep -q 'Signature=adhoc'; then
    fail "App bundle is adhoc-signed and is not distributable: $app"
  fi

  if printf '%s\n' "$details" | grep -q 'TeamIdentifier=not set'; then
    fail "App bundle signing TeamIdentifier is missing: $app"
  fi

  if ! printf '%s\n' "$details" | grep -Eq 'flags=.*runtime'; then
    fail "App bundle is not signed with hardened runtime: $app"
  fi

  gatekeeper_output="$(spctl -a -vvv -t exec "$app" 2>&1)"
  reject_gatekeeper_override "$gatekeeper_output" "$app"
  printf '%s\n' "$gatekeeper_output"

  echo "Verified signed macOS app:"
  echo "  app: $app"
  printf '%s\n' "$details" | sed -n 's/^Authority=/  authority: /p'
  printf '%s\n' "$details" | sed -n 's/^TeamIdentifier=/  teamIdentifier: /p'
}

verify_dmg() {
  local dmg="$1"
  local stapler_output gatekeeper_output

  stapler_output="$(xcrun stapler validate "$dmg" 2>&1)"
  printf '%s\n' "$stapler_output"

  gatekeeper_output="$(spctl -a -vvv -t open --context context:primary-signature "$dmg" 2>&1)"
  reject_gatekeeper_override "$gatekeeper_output" "$dmg"
  printf '%s\n' "$gatekeeper_output"

  echo "Verified notarized macOS DMG:"
  echo "  dmg: $dmg"
}

for app in "${APPS[@]}"; do
  verify_app "$app"
done

for dmg in "${DMGS[@]}"; do
  verify_dmg "$dmg"
done
