#!/bin/bash

# Quantix Tickets - Systemd Service Installer
# Installation Script für systemctl Auto-Restart

set -e

echo "🚀 Quantix Tickets - Systemd Service Installation"
echo "=================================================="
echo ""

# Prüfe ob Script als Root läuft
if [ "$EUID" -ne 0 ]; then
    echo "❌ Bitte als Root ausführen: sudo ./install-service.sh"
    exit 1
fi

# Hole aktuelles Verzeichnis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/quantix-tickets.service"
SYSTEMD_DIR="/etc/systemd/system"

echo "📁 Bot-Verzeichnis: $SCRIPT_DIR"
echo ""

# Prüfe ob Service-Datei existiert
if [ ! -f "$SERVICE_FILE" ]; then
    echo "❌ Service-Datei nicht gefunden: $SERVICE_FILE"
    exit 1
fi

# Hole aktuellen User (der sudo ausgeführt hat)
ACTUAL_USER="${SUDO_USER:-$USER}"

if [ "$ACTUAL_USER" = "root" ]; then
    echo "⚠️  WARNUNG: Kein SUDO_USER gefunden!"
    read -p "Unter welchem User soll der Bot laufen? " ACTUAL_USER
fi

echo "👤 Bot läuft als User: $ACTUAL_USER"
echo ""

# Erstelle temporäre Service-Datei mit korrekten Pfaden
TMP_SERVICE="/tmp/quantix-tickets.service.tmp"
cp "$SERVICE_FILE" "$TMP_SERVICE"

# Ersetze Platzhalter
sed -i "s|YOUR_USERNAME|$ACTUAL_USER|g" "$TMP_SERVICE"
sed -i "s|/path/to/TRS-Tickets-Bot-1|$SCRIPT_DIR|g" "$TMP_SERVICE"

# Prüfe ob node installiert ist
if ! command -v node &> /dev/null; then
    echo "❌ Node.js ist nicht installiert!"
    echo "   Installiere Node.js: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

NODE_PATH=$(which node)
sed -i "s|/usr/bin/node|$NODE_PATH|g" "$TMP_SERVICE"

echo "✅ Service-Datei konfiguriert"
echo ""

# Kopiere Service-Datei
echo "📋 Kopiere Service nach $SYSTEMD_DIR..."
cp "$TMP_SERVICE" "$SYSTEMD_DIR/quantix-tickets.service"
rm "$TMP_SERVICE"

# Setze Berechtigungen
chmod 644 "$SYSTEMD_DIR/quantix-tickets.service"

# Reload systemd
echo "🔄 Lade systemd neu..."
systemctl daemon-reload

# Enable Service
echo "✅ Aktiviere Service für Autostart..."
systemctl enable quantix-tickets.service

echo ""
echo "✅ Installation erfolgreich!"
echo ""
echo "📚 Wichtige Commands:"
echo "   sudo systemctl start quantix-tickets    # Bot starten"
echo "   sudo systemctl stop quantix-tickets     # Bot stoppen"
echo "   sudo systemctl restart quantix-tickets  # Bot neustarten"
echo "   sudo systemctl status quantix-tickets   # Status anzeigen"
echo "   sudo journalctl -u quantix-tickets -f   # Logs live ansehen"
echo ""
read -p "Möchtest du den Bot jetzt starten? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starte Bot..."
    systemctl start quantix-tickets
    sleep 2
    systemctl status quantix-tickets --no-pager
fi

echo ""
echo "✅ Fertig! Der Bot startet automatisch bei System-Boot."
