"""
Helper Functions
Rate-limiting, embed builders, and utilities
"""

import asyncio
import discord
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

# Priority States
PRIORITY_STATES = [
    {"dot": "🟢", "embedColor": 0x2bd94a, "label": "Grün"},
    {"dot": "🟠", "embedColor": 0xff9900, "label": "Orange"},
    {"dot": "🔴", "embedColor": 0xd92b2b, "label": "Rot"}
]

# Constants
PREFIX = "🎫│"
VERSION = "Alpha 1.0"

# Rename Queue for rate-limiting channel renames
rename_queue: Dict[int, Dict[str, Any]] = {}
RENAME_MIN_INTERVAL = 3.0  # seconds
RENAME_MAX_DELAY = 8.0  # seconds


def build_channel_name(ticket_number: int, priority_index: int) -> str:
    """Build channel name with priority indicator."""
    num = str(ticket_number).zfill(5)
    state = PRIORITY_STATES[priority_index] if 0 <= priority_index < len(PRIORITY_STATES) else PRIORITY_STATES[0]
    return f"{PREFIX}{state['dot']}ticket-{num}"


async def schedule_channel_rename(channel: discord.TextChannel, desired_name: str) -> None:
    """
    Schedule a channel rename with rate-limiting.

    This prevents Discord rate limit errors by queueing renames
    and ensuring minimum time between requests.
    """
    channel_id = channel.id
    now = datetime.now()

    if channel_id not in rename_queue:
        rename_queue[channel_id] = {
            "desired_name": desired_name,
            "last_applied": datetime.min,
            "task": None
        }

    entry = rename_queue[channel_id]
    entry["desired_name"] = desired_name

    async def apply_rename():
        """Apply the rename with rate-limiting."""
        while True:
            entry = rename_queue.get(channel_id)
            if not entry:
                return

            needed_name = entry["desired_name"]

            # Check if already correct
            try:
                await channel.fetch()  # Refresh channel data
                if channel.name == needed_name:
                    entry["last_applied"] = datetime.now()
                    if entry.get("task"):
                        entry["task"] = None
                    return
            except:
                return

            # Check rate limit
            time_since_last = (datetime.now() - entry["last_applied"]).total_seconds()
            if time_since_last < RENAME_MIN_INTERVAL:
                await asyncio.sleep(RENAME_MIN_INTERVAL - time_since_last)
                continue

            # Apply rename
            try:
                await channel.edit(name=needed_name)
                entry["last_applied"] = datetime.now()

                # Check if more renames are needed
                if entry["desired_name"] == needed_name:
                    if entry.get("task"):
                        entry["task"] = None
                    return
            except Exception as e:
                print(f"Error renaming channel: {e}")
                await asyncio.sleep(4.0)

    # Cancel existing task if any
    if entry.get("task") and not entry["task"].done():
        entry["task"].cancel()

    # Schedule new task
    time_since_last = (now - entry["last_applied"]).total_seconds()
    if time_since_last > RENAME_MAX_DELAY:
        delay = 0.25
    else:
        delay = 0.5

    await asyncio.sleep(delay)
    entry["task"] = asyncio.create_task(apply_rename())


async def rename_channel_if_needed(channel: discord.TextChannel, ticket: Dict[str, Any]) -> None:
    """Rename channel if needed based on ticket data."""
    desired = build_channel_name(ticket["id"], ticket.get("priority", 0))
    if channel.name != desired:
        await schedule_channel_rename(channel, desired)


def build_ticket_embed(config: Dict[str, Any], interaction: discord.Interaction,
                       topic: Dict[str, str], ticket_number: int) -> discord.Embed:
    """
    Build ticket embed with placeholders replaced.

    Args:
        config: Bot configuration
        interaction: Discord interaction
        topic: Topic dictionary
        ticket_number: Ticket number

    Returns:
        Discord embed
    """
    ticket_embed = config.get("ticketEmbed", {})

    def replace_placeholders(text: str) -> str:
        """Replace placeholders in text."""
        if not text:
            return ""
        return (text
                .replace("{ticketNumber}", str(ticket_number))
                .replace("{topicLabel}", topic.get("label", ""))
                .replace("{topicValue}", topic.get("value", ""))
                .replace("{userMention}", interaction.user.mention)
                .replace("{userId}", str(interaction.user.id)))

    # Build embed
    title = replace_placeholders(ticket_embed.get("title", "🎫 Ticket"))
    description = replace_placeholders(ticket_embed.get("description", interaction.user.mention))

    embed = discord.Embed(
        title=title,
        description=description
    )

    # Set color
    color = ticket_embed.get("color", "#2b90d9")
    if isinstance(color, str) and color.startswith("#"):
        try:
            embed.color = int(color[1:], 16)
        except ValueError:
            embed.color = 0x2b90d9

    # Set footer
    footer = ticket_embed.get("footer")
    if footer:
        embed.set_footer(text=replace_placeholders(footer))

    return embed


def build_panel_embed(config: Dict[str, Any]) -> Optional[discord.Embed]:
    """Build panel embed from config."""
    panel_embed = config.get("panelEmbed", {})

    if not panel_embed.get("title") and not panel_embed.get("description"):
        return None

    embed = discord.Embed()

    if panel_embed.get("title"):
        embed.title = panel_embed["title"]

    if panel_embed.get("description"):
        embed.description = panel_embed["description"]

    # Set color
    color = panel_embed.get("color", "#5865F2")
    if isinstance(color, str) and color.startswith("#"):
        try:
            embed.color = int(color[1:], 16)
        except ValueError:
            embed.color = 0x5865F2

    # Set footer
    if panel_embed.get("footer"):
        embed.set_footer(text=panel_embed["footer"])

    return embed


def get_form_fields_for_topic(config: Dict[str, Any], topic_value: str) -> List[Dict[str, Any]]:
    """
    Get form fields for a specific topic.

    Args:
        config: Bot configuration
        topic_value: Topic value

    Returns:
        List of form fields (max 5 for Discord modal limit)
    """
    all_fields = config.get("formFields", [])

    # Filter fields for this topic
    fields = []
    for field in all_fields:
        if not field:
            continue

        topic_filter = field.get("topic")

        # Global field (no topic specified)
        if not topic_filter:
            fields.append(field)
            continue

        # Topic-specific field
        if isinstance(topic_filter, list):
            if topic_value in topic_filter:
                fields.append(field)
        elif topic_filter == topic_value:
            fields.append(field)

    # Discord modal limit: 5 fields
    return fields[:5]


def normalize_field(field: Dict[str, Any], index: int) -> Dict[str, Any]:
    """Normalize form field data."""
    return {
        "label": (field.get("label", f"Feld {index + 1}"))[:45],
        "id": field.get("id", f"f{index}"),
        "required": bool(field.get("required", False)),
        "style": field.get("style", "short")
    }
