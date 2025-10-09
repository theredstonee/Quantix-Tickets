"""
TRS Tickets Bot - Main Entry Point
Starts both Discord bot and Flask web panel
"""

import os
import asyncio
import threading
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Import bot and web panel
import bot
import web_panel

def run_flask():
    """Run Flask web panel in separate thread."""
    port = int(os.getenv('PORT', 3000))
    print(f"🌐 Panel starting on port {port}...")
    web_panel.app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)


def run_bot():
    """Run Discord bot."""
    token = os.getenv('DISCORD_TOKEN')

    if not token:
        print("❌ DISCORD_TOKEN nicht gefunden in .env")
        return

    # Set bot client in web panel
    web_panel.set_bot_client(bot.bot_client)

    print("🤖 Bot starting...")
    bot.bot_client.run(token)


if __name__ == "__main__":
    print("=" * 50)
    print("TRS Tickets Bot - Python Edition")
    print("=" * 50)

    # Start Flask in separate thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Give Flask time to start
    import time
    time.sleep(2)

    # Run bot in main thread
    run_bot()
