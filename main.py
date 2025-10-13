"""
TRS Tickets Bot - Main Entry Point
Runs both Discord Bot and Flask Web Panel
"""

import os
import threading
import time
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Import bot
from bot import bot

# Import Flask app
from panel_flask import app, set_discord_client


def run_flask():
    """Run Flask web server in separate thread."""
    port = int(os.getenv('PORT', 3000))
    print(f"🌐 Starting Flask web panel on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)


def main():
    """Main entry point."""
    print("=" * 60)
    print("TRS Tickets Bot - Python Version")
    print("=" * 60)

    # Start Flask in background thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Give Flask time to start
    time.sleep(2)

    print("⏳ Waiting for Discord bot to initialize...")

    # Set Discord client for Flask
    set_discord_client(bot)

    # Run Discord bot (blocking)
    TOKEN = os.getenv('DISCORD_TOKEN')
    if not TOKEN:
        print("❌ DISCORD_TOKEN nicht gefunden in .env")
        return

    print("🤖 Starting Discord bot...")
    bot.run(TOKEN)


if __name__ == "__main__":
    main()
