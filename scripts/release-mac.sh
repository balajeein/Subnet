#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_DIR/release/public"
NOTARY_KEYCHAIN_PROFILE="${NOTARY_KEYCHAIN_PROFILE:-AC_PASSWORD}"

echo "Checking for an Apple Developer ID Application certificate…"
DEV_ID="$(security find-identity -v -p codesigning 2>/dev/null \
  | grep 'Developer ID Application' \
  | head -n 1 \
  | sed -E 's/.*\"([^\"]+)\".*/\1/' || true)"

if [ -z "$DEV_ID" ]; then
  echo "No Developer ID Application certificate is installed in this Mac's keychain."
  echo "A local/self-signed certificate cannot produce a DMG that other Macs can open normally."
  echo "Install a Developer ID Application certificate, then run: npm run release:mac"
  exit 1
fi

if ! xcrun notarytool history --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" >/dev/null 2>&1; then
  echo "Notarization profile '$NOTARY_KEYCHAIN_PROFILE' was not found."
  echo "Configure it with xcrun notarytool store-credentials, then rerun npm run release:mac."
  exit 1
fi

rm -rf "$RELEASE_DIR"

echo "Building and signing Subnet with: $DEV_ID"
CSC_NAME="$DEV_ID" CSC_IDENTITY_AUTO_DISCOVERY=true \
  npx electron-builder --config "$PROJECT_DIR/electron-builder.release.json" \
  --mac dmg --universal --publish never

APP_BUNDLE="$RELEASE_DIR/mac-universal/Subnet.app"
DMG_FILE="$(find "$RELEASE_DIR" -maxdepth 1 -type f -name 'Subnet-*.dmg' -print -quit)"

if [ ! -d "$APP_BUNDLE" ] || [ -z "$DMG_FILE" ]; then
  echo "The release build did not produce the expected app and DMG."
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
codesign -dv --verbose=4 "$APP_BUNDLE" 2>&1 | grep -E 'Authority=|Identifier=|TeamIdentifier=|flags='

codesign --force --sign "$DEV_ID" "$DMG_FILE"
xcrun notarytool submit "$DMG_FILE" --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" --wait
xcrun stapler staple "$DMG_FILE"
spctl --assess --type open --context context:primary-signature --verbose "$DMG_FILE"

echo "Public notarized DMG: $DMG_FILE"
