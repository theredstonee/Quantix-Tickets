"""
Config Management Module
Handles multi-server configuration (JSON-based)
"""

import os
import json
from pathlib import Path
from typing import Any, Dict, Optional

# Directories
BASE_DIR = Path(__file__).parent
CONFIG_DIR = BASE_DIR / "configs"
LEGACY_CONFIG = BASE_DIR / "config.json"

# Ensure configs directory exists
CONFIG_DIR.mkdir(exist_ok=True)


def safe_read(file_path: Path, fallback: Any = None) -> Any:
    """Safely read and parse JSON file."""
    try:
        if not file_path.exists():
            return fallback
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            return json.loads(content) if content else fallback
    except (json.JSONDecodeError, IOError):
        return fallback


def safe_write(file_path: Path, data: Any) -> None:
    """Safely write data to JSON file."""
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except IOError as e:
        print(f"Error writing to {file_path}: {e}")


def get_config_path(guild_id: Optional[str] = None) -> Path:
    """Get config file path for a guild."""
    if not guild_id:
        return LEGACY_CONFIG
    return CONFIG_DIR / f"{guild_id}.json"


def get_tickets_path(guild_id: Optional[str] = None) -> Path:
    """Get tickets file path for a guild."""
    if not guild_id:
        return BASE_DIR / "tickets.json"
    return CONFIG_DIR / f"{guild_id}_tickets.json"


def get_counter_path(guild_id: Optional[str] = None) -> Path:
    """Get counter file path for a guild."""
    if not guild_id:
        return BASE_DIR / "ticketCounter.json"
    return CONFIG_DIR / f"{guild_id}_counter.json"


def read_config(guild_id: Optional[str] = None) -> Dict[str, Any]:
    """Read configuration for a guild."""
    config_path = get_config_path(guild_id)

    if not guild_id:
        # Legacy fallback
        return safe_read(config_path, {})

    # Try to load guild-specific config
    config = safe_read(config_path, None)

    if config is None:
        # Create default config
        default_config = {
            "guildId": guild_id,
            "topics": [],
            "formFields": [],
            "teamRoleId": "1387525699908272218",  # Default team role
            "ticketEmbed": {
                "title": "🎫 Ticket #{ticketNumber}",
                "description": "Hallo {userMention}\n**Thema:** {topicLabel}",
                "color": "#2b90d9",
                "footer": "TRS Tickets ©️"
            },
            "panelEmbed": {
                "title": "🎫 Ticket System",
                "description": "Wähle dein Thema",
                "color": "#5865F2",
                "footer": "TRS Tickets ©️"
            }
        }
        write_config(guild_id, default_config)
        return default_config

    return config


def write_config(guild_id: Optional[str], data: Dict[str, Any]) -> None:
    """Write configuration for a guild."""
    config_path = get_config_path(guild_id)
    safe_write(config_path, data)


def load_tickets(guild_id: Optional[str] = None) -> list:
    """Load tickets for a guild."""
    tickets_path = get_tickets_path(guild_id)
    tickets = safe_read(tickets_path, [])

    # Ensure tickets file exists
    if not tickets_path.exists():
        safe_write(tickets_path, [])

    return tickets if isinstance(tickets, list) else []


def save_tickets(guild_id: Optional[str], tickets: list) -> None:
    """Save tickets for a guild."""
    tickets_path = get_tickets_path(guild_id)
    safe_write(tickets_path, tickets)


def next_ticket_number(guild_id: Optional[str] = None) -> int:
    """Get next ticket number for a guild."""
    counter_path = get_counter_path(guild_id)
    counter = safe_read(counter_path, {"last": 0})

    counter["last"] = counter.get("last", 0) + 1
    safe_write(counter_path, counter)

    return counter["last"]


# Initialize legacy files
legacy_counter = BASE_DIR / "ticketCounter.json"
legacy_tickets = BASE_DIR / "tickets.json"

if not legacy_counter.exists():
    safe_write(legacy_counter, {"last": 0})

if not legacy_tickets.exists():
    safe_write(legacy_tickets, [])
