#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$*"
  exit 1
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "macOS app bundle verification must run on macOS."
fi

APP_BUNDLE="${1:-src-tauri/target/release/bundle/macos/MobausStudio.app}"
INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"

[ -d "$APP_BUNDLE" ] || fail "Missing app bundle: $APP_BUNDLE"
[ -f "$INFO_PLIST" ] || fail "Missing Info.plist: $INFO_PLIST"

plutil -lint "$INFO_PLIST" >/dev/null

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$INFO_PLIST" 2>/dev/null || true
}

EXECUTABLE="$(plist_value CFBundleExecutable)"
IDENTIFIER="$(plist_value CFBundleIdentifier)"
PACKAGE_TYPE="$(plist_value CFBundlePackageType)"
REQUIRES_CARBON="$(plist_value LSRequiresCarbon)"
PRINCIPAL_CLASS="$(plist_value NSPrincipalClass)"

[ -n "$EXECUTABLE" ] || fail "CFBundleExecutable is empty."
[ "$IDENTIFIER" = "com.mobaus.studio" ] || fail "Unexpected CFBundleIdentifier: $IDENTIFIER"
[ "$PACKAGE_TYPE" = "APPL" ] || fail "Unexpected CFBundlePackageType: $PACKAGE_TYPE"
[ "$PRINCIPAL_CLASS" = "NSApplication" ] || fail "Unexpected NSPrincipalClass: $PRINCIPAL_CLASS"

if [ -n "$REQUIRES_CARBON" ] && [ "$REQUIRES_CARBON" != "false" ]; then
  fail "LSRequiresCarbon must be false or absent, got: $REQUIRES_CARBON"
fi

EXECUTABLE_PATH="$APP_BUNDLE/Contents/MacOS/$EXECUTABLE"
[ -x "$EXECUTABLE_PATH" ] || fail "Bundle executable is missing or not executable: $EXECUTABLE_PATH"
file "$EXECUTABLE_PATH" | grep -q 'Mach-O' || fail "Bundle executable is not a Mach-O binary: $EXECUTABLE_PATH"

echo "Verified macOS app bundle:"
echo "  bundle: $APP_BUNDLE"
echo "  executable: $EXECUTABLE"
echo "  identifier: $IDENTIFIER"
echo "  packageType: $PACKAGE_TYPE"
echo "  LSRequiresCarbon: ${REQUIRES_CARBON:-absent}"
echo "  NSPrincipalClass: $PRINCIPAL_CLASS"
