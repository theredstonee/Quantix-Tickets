"""
Transcript Generation Module
Creates HTML and TXT transcripts of ticket channels
"""

import discord
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

BASE_DIR = Path(__file__).parent.parent


async def create_transcript(channel: discord.TextChannel, ticket: Dict[str, Any],
                           resolve_mentions: bool = True) -> Dict[str, Path]:
    """
    Create transcript files for a ticket channel.

    Args:
        channel: Discord text channel
        ticket: Ticket data dictionary
        resolve_mentions: Whether to resolve mentions to readable names

    Returns:
        Dictionary with 'txt' and 'html' file paths
    """
    # Fetch up to 1000 messages
    messages: List[discord.Message] = []
    async for message in channel.history(limit=1000, oldest_first=True):
        messages.append(message)

    # Helper function to resolve mentions
    def mention_to_name(text: str) -> str:
        """Convert mentions to readable names."""
        if not resolve_mentions or not text:
            return text

        result = text

        # User mentions <@123> or <@!123>
        for member in channel.guild.members:
            result = result.replace(f"<@{member.id}>", f"@{member.display_name}")
            result = result.replace(f"<@!{member.id}>", f"@{member.display_name}")

        # Role mentions <@&123>
        for role in channel.guild.roles:
            result = result.replace(f"<@&{role.id}>", f"@{role.name}")

        # Channel mentions <#123>
        for ch in channel.guild.channels:
            result = result.replace(f"<#{ch.id}>", f"#{ch.name}")

        return result

    # Build TXT content
    txt_lines = [
        f"# Transcript Ticket {ticket['id']}",
        f"Channel: {channel.name}",
        f"Erstellt: {datetime.fromtimestamp(ticket['timestamp'] / 1000).isoformat()}",
        ""
    ]

    for msg in messages:
        timestamp = msg.created_at.isoformat()
        author = msg.author.name if msg.author else "Unbekannt"
        content = mention_to_name(msg.content or "").replace("\n", "\\n")

        txt_lines.append(f"[{timestamp}] {author}: {content}")

        if msg.attachments:
            for att in msg.attachments:
                txt_lines.append(f"  [Anhang] {att.filename} -> {att.url}")

    txt_content = "\n".join(txt_lines)

    # Build HTML content
    html_messages = []
    for msg in messages:
        attachments_html = ""
        if msg.attachments:
            for att in msg.attachments:
                attachments_html += f"<span class='att'>📎 <a href='{att.url}'>{att.filename}</a></span>"

        timestamp = msg.created_at.isoformat()
        author = msg.author.name if msg.author else "Unbekannt"
        text = mention_to_name(msg.content or "").replace("<", "&lt;")

        html_messages.append(
            f"<div class='m'>"
            f"<span class='t'>{timestamp}</span>"
            f"<span class='a'>{author}</span>"
            f"<span>{text}</span>"
            f"{attachments_html}"
            f"</div>"
        )

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Transcript {ticket['id']}</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            background: #111;
            color: #eee;
            padding: 20px;
        }}
        .m {{
            margin: 4px 0;
        }}
        .t {{
            color: #888;
            font-size: 11px;
            margin-right: 6px;
        }}
        .a {{
            color: #4ea1ff;
            font-weight: bold;
            margin-right: 4px;
        }}
        .att {{
            color: #ffa500;
            font-size: 11px;
            display: block;
            margin-left: 2rem;
        }}
    </style>
</head>
<body>
    <h1>Transcript Ticket {ticket['id']}</h1>
    <p>
        Channel: {channel.name}<br>
        Erstellt: {datetime.fromtimestamp(ticket['timestamp'] / 1000).isoformat()}<br>
        Nachrichten: {len(messages)}
    </p>
    <hr>
    {''.join(html_messages)}
</body>
</html>"""

    # Write files
    txt_file = BASE_DIR / f"transcript_{ticket['id']}.txt"
    html_file = BASE_DIR / f"transcript_{ticket['id']}.html"

    txt_file.write_text(txt_content, encoding='utf-8')
    html_file.write_text(html_content, encoding='utf-8')

    return {
        'txt': txt_file,
        'html': html_file
    }
