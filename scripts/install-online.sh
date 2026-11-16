#!/usr/bin/env bash
# ========================================================================
#          TeXNote - Online Linux Installer (by IRSpace)
#          Author  : Rijwan Ansari
#          Company : IRSpace
#          Website : https://texnote.irspace.in
#          Repo    : https://github.com/rij1/texnote
# ========================================================================
set -e

RELEASE_PAYLOAD_URL="https://github.com/rij1/texnote/releases/download/v1.0.0/TeXNote-Linux-Installer.sh"
TMP_INSTALLER="/tmp/TeXNote-Linux-Installer.sh"

echo "========================================================================"
echo "          TeXNote - Online Linux Installer (by IRSpace)"
echo "          Website : https://texnote.irspace.in"
echo "========================================================================"
echo ""

echo "[*] Downloading TeXNote Standalone Linux Installer (~633 MB)..."
echo "    Source: $RELEASE_PAYLOAD_URL"
echo ""

if command -v curl >/dev/null 2>&1; then
    curl -fSL --progress-bar "$RELEASE_PAYLOAD_URL" -o "$TMP_INSTALLER"
elif command -v wget >/dev/null 2>&1; then
    wget --show-progress -qO "$TMP_INSTALLER" "$RELEASE_PAYLOAD_URL"
else
    echo "[-] Error: Neither curl nor wget was found on this system."
    echo "    Please install curl (e.g. sudo apt install curl) and retry."
    exit 1
fi

if [ ! -s "$TMP_INSTALLER" ]; then
    echo "[-] Error: Downloaded file is empty or missing."
    echo "    Please check your network connection or verify that the release exists at:"
    echo "    https://github.com/rij1/texnote/releases"
    exit 1
fi

chmod +x "$TMP_INSTALLER"

echo ""
echo "[*] Launching TeXNote installer..."
sudo bash "$TMP_INSTALLER"
rm -f "$TMP_INSTALLER"

echo ""
echo "[+] TeXNote installation complete!"
echo "    Launch TeXNote anytime from your app menu or terminal: texnote"
