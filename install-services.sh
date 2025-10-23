#!/bin/bash

# Quantix Tickets - Dual Service Systemd Installer
# Installiert Bot + Web als separate Services

set -e

echo "🚀 Quantix Tickets - Dual Service Installation"
echo "==============================================="
echo ""

# Prüfe ob Script als Root läuft
if [ "$EUID" -ne 0 ]; then
    echo "❌ Bitte als Root ausführen: sudo ./install-services.sh"
    exit 1
fi

# Hole aktuelles Verzeichnis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="/etc/systemd/system"

echo "📁 Bot-Verzeichnis: $SCRIPT_DIR"
echo ""

# Prüfe ob Service-Dateien existieren
if [ ! -f "$SCRIPT_DIR/quantix-bot.service" ]; then
    echo "❌ quantix-bot.service nicht gefunden!"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/quantix-web.service" ]; then
    echo "❌ quantix-web.service nicht gefunden!"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/quantix-tickets.target" ]; then
    echo "❌ quantix-tickets.target nicht gefunden!"
    exit 1
fi

# Hole aktuellen User (der sudo ausgeführt hat)
ACTUAL_USER="${SUDO_USER:-$USER}"

if [ "$ACTUAL_USER" = "root" ]; then
    echo "⚠️  WARNUNG: Kein SUDO_USER gefunden!"
    read -p "Unter welchem User soll der Bot laufen? " ACTUAL_USER
fi

echo "👤 Services laufen als User: $ACTUAL_USER"
echo ""

# Prüfe ob node installiert ist
if ! command -v node &> /dev/null; then
    echo "❌ Node.js ist nicht installiert!"
    echo "   Installiere Node.js: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

NODE_PATH=$(which node)
echo "✅ Node.js gefunden: $NODE_PATH"
echo ""

# Erstelle temporäre Service-Dateien
TMP_BOT_SERVICE="/tmp/quantix-bot.service.tmp"
TMP_WEB_SERVICE="/tmp/quantix-web.service.tmp"
TMP_TARGET="/tmp/quantix-tickets.target.tmp"

cp "$SCRIPT_DIR/quantix-bot.service" "$TMP_BOT_SERVICE"
cp "$SCRIPT_DIR/quantix-web.service" "$TMP_WEB_SERVICE"
cp "$SCRIPT_DIR/quantix-tickets.target" "$TMP_TARGET"

# Ersetze Platzhalter in allen Dateien
for file in "$TMP_BOT_SERVICE" "$TMP_WEB_SERVICE"; do
    sed -i "s|User=trs-bot|User=$ACTUAL_USER|g" "$file"
    sed -i "s|Group=trs-bot|Group=$ACTUAL_USER|g" "$file"
    sed -i "s|/home/trs-bot/ticketbot|$SCRIPT_DIR|g" "$file"
    sed -i "s|/usr/bin/node|$NODE_PATH|g" "$file"
done

echo "✅ Service-Dateien konfiguriert"
echo ""

# Kopiere Service-Dateien
echo "📋 Kopiere Services nach $SYSTEMD_DIR..."
cp "$TMP_BOT_SERVICE" "$SYSTEMD_DIR/quantix-bot.service"
cp "$TMP_WEB_SERVICE" "$SYSTEMD_DIR/quantix-web.service"
cp "$TMP_TARGET" "$SYSTEMD_DIR/quantix-tickets.target"

# Cleanup temporäre Dateien
rm "$TMP_BOT_SERVICE" "$TMP_WEB_SERVICE" "$TMP_TARGET"

# Setze Berechtigungen
chmod 644 "$SYSTEMD_DIR/quantix-bot.service"
chmod 644 "$SYSTEMD_DIR/quantix-web.service"
chmod 644 "$SYSTEMD_DIR/quantix-tickets.target"

echo "✅ Service-Dateien installiert:"
echo "   - $SYSTEMD_DIR/quantix-bot.service"
echo "   - $SYSTEMD_DIR/quantix-web.service"
echo "   - $SYSTEMD_DIR/quantix-tickets.target"
echo ""

# Reload systemd
echo "🔄 Lade systemd neu..."
systemctl daemon-reload

# Enable Services
echo "✅ Aktiviere Services für Autostart..."
systemctl enable quantix-bot.service
systemctl enable quantix-web.service
systemctl enable quantix-tickets.target

echo ""
echo "✅ Installation erfolgreich!"
echo ""
echo "📚 Wichtige Commands:"
echo ""
echo "  🤖 Bot Service:"
echo "     sudo systemctl start quantix-bot      # Bot starten"
echo "     sudo systemctl stop quantix-bot       # Bot stoppen"
echo "     sudo systemctl restart quantix-bot    # Bot neustarten"
echo "     sudo systemctl status quantix-bot     # Bot Status"
echo "     sudo journalctl -u quantix-bot -f     # Bot Logs"
echo ""
echo "  🌐 Web Service:"
echo "     sudo systemctl start quantix-web      # Web starten"
echo "     sudo systemctl stop quantix-web       # Web stoppen"
echo "     sudo systemctl restart quantix-web    # Web neustarten"
echo "     sudo systemctl status quantix-web     # Web Status"
echo "     sudo journalctl -u quantix-web -f     # Web Logs"
echo ""
echo "  🎯 Beide Services zusammen:"
echo "     sudo systemctl start quantix-tickets.target    # Beide starten"
echo "     sudo systemctl stop quantix-tickets.target     # Beide stoppen"
echo "     sudo systemctl restart quantix-tickets.target  # Beide neustarten"
echo ""
echo "  📊 Beide Logs gleichzeitig:"
echo "     sudo journalctl -u quantix-bot -u quantix-web -f"
echo ""

read -p "Möchtest du beide Services jetzt starten? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starte Services..."
    systemctl start quantix-tickets.target
    sleep 3
    echo ""
    echo "📊 Bot Status:"
    systemctl status quantix-bot --no-pager --lines=5
    echo ""
    echo "📊 Web Status:"
    systemctl status quantix-web --no-pager --lines=5
fi

echo ""
echo "✅ Fertig!"
echo "💡 Tipp: Beide Services starten automatisch bei System-Boot"
echo "📖 Siehe SYSTEMD-GUIDE.md für mehr Infos"
