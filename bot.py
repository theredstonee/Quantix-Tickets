"""
TRS Tickets Bot - Python Version
Discord.py Ticket Bot with Multi-Server Support
"""

import os
import asyncio
import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

# Import local modules
import config
from utils.translations import t, get_guild_language, set_guild_language, get_language_name
from utils.helpers import (
    PRIORITY_STATES, PREFIX, VERSION,
    build_channel_name, rename_channel_if_needed,
    build_ticket_embed, build_panel_embed,
    get_form_fields_for_topic, normalize_field
)
from utils.transcripts import create_transcript

# Load environment variables
load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')
PANEL_URL = os.getenv('PANEL_URL', 'https://trstickets.theredstonee.de/panel')

# Bot setup
intents = discord.Intents.default()
intents.guilds = True
intents.guild_messages = True
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix='!', intents=intents)


# ==================== Helper Functions ====================

def get_team_role(guild_id: str) -> Optional[str]:
    """Get team role ID from config."""
    cfg = config.read_config(guild_id)
    return cfg.get('teamRoleId')


async def log_event(guild: discord.Guild, text: str) -> None:
    """Log event to configured log channel."""
    cfg = config.read_config(str(guild.id))
    log_channel_id = cfg.get('logChannelId')

    if not log_channel_id:
        return

    try:
        channel = await guild.fetch_channel(int(log_channel_id))
        if not channel:
            return

        # Berlin timezone
        embed = discord.Embed(
            description=text,
            color=0x00ff00,
            timestamp=datetime.now()
        )
        embed.set_footer(text='TRS Tickets ©️')

        await channel.send(embed=embed)
    except Exception as e:
        print(f"Log error: {e}")


def build_button_rows(claimed: bool, guild_id: str) -> List[discord.ui.ActionRow]:
    """Build button rows for ticket."""
    view = discord.ui.View(timeout=None)

    # Row 1: Request Close
    request_close_btn = discord.ui.Button(
        custom_id='request_close',
        emoji='❓',
        label=t(guild_id, 'buttons.request_close'),
        style=discord.ButtonStyle.secondary
    )
    view.add_item(request_close_btn)

    # Row 2: Close, Priority, Claim/Unclaim
    close_btn = discord.ui.Button(
        custom_id='close',
        emoji='🔒',
        label=t(guild_id, 'buttons.close'),
        style=discord.ButtonStyle.danger
    )
    priority_down_btn = discord.ui.Button(
        custom_id='priority_down',
        emoji='🔻',
        label=t(guild_id, 'buttons.priority_down'),
        style=discord.ButtonStyle.primary
    )
    priority_up_btn = discord.ui.Button(
        custom_id='priority_up',
        emoji='🔺',
        label=t(guild_id, 'buttons.priority_up'),
        style=discord.ButtonStyle.primary
    )

    if claimed:
        claim_btn = discord.ui.Button(
            custom_id='unclaim',
            emoji='🔄',
            label=t(guild_id, 'buttons.unclaim'),
            style=discord.ButtonStyle.secondary
        )
    else:
        claim_btn = discord.ui.Button(
            custom_id='claim',
            emoji='✅',
            label=t(guild_id, 'buttons.claim'),
            style=discord.ButtonStyle.success
        )

    view.add_item(close_btn)
    view.add_item(priority_down_btn)
    view.add_item(priority_up_btn)
    view.add_item(claim_btn)

    # Row 3: Add User
    add_user_btn = discord.ui.Button(
        custom_id='add_user',
        emoji='➕',
        label=t(guild_id, 'buttons.add_user'),
        style=discord.ButtonStyle.secondary
    )
    view.add_item(add_user_btn)

    return view


def build_panel_select(cfg: Dict[str, Any]) -> discord.ui.View:
    """Build panel select menu."""
    topics = [t for t in cfg.get('topics', []) if t and t.get('label') and t.get('value')]

    if not topics:
        topics = [{'label': 'Keine Topics konfiguriert', 'value': 'none', 'emoji': '⚠️'}]

    options = []
    for topic in topics:
        emoji = topic.get('emoji')
        options.append(
            discord.SelectOption(
                label=topic['label'],
                value=topic['value'],
                emoji=emoji if emoji else None
            )
        )

    select = discord.ui.Select(
        custom_id='topic',
        placeholder='Wähle dein Thema …',
        options=options
    )

    view = discord.ui.View(timeout=None)
    view.add_item(select)

    return view


# ==================== Ticket Creation ====================

async def create_ticket_channel(interaction: discord.Interaction, topic: Dict[str, str],
                                form_data: Dict[str, str], cfg: Dict[str, Any]) -> None:
    """Create a ticket channel."""
    guild_id = str(interaction.guild.id)
    ticket_number = config.next_ticket_number(guild_id)

    # Get parent category
    parent_id = cfg.get('ticketCategoryId')
    parent = None
    if parent_id:
        try:
            parent = await interaction.guild.fetch_channel(int(parent_id))
        except:
            print(f"Category not found: {parent_id}")

    # Build permission overwrites
    overwrites = {
        interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False),
        interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True)
    }

    # Add team role
    team_role_id = get_team_role(guild_id)
    if team_role_id:
        try:
            team_role = interaction.guild.get_role(int(team_role_id))
            if team_role:
                overwrites[team_role] = discord.PermissionOverwrite(view_channel=True, send_messages=True)
        except:
            print(f"Team role not found: {team_role_id}")

    # Create channel
    channel_name = build_channel_name(ticket_number, 0)
    channel = await interaction.guild.create_text_channel(
        name=channel_name,
        category=parent,
        overwrites=overwrites
    )

    # Build embed
    embed = build_ticket_embed(cfg, interaction, topic, ticket_number)

    # Add form fields
    if form_data:
        form_fields = get_form_fields_for_topic(cfg, topic['value'])
        normalized_fields = [normalize_field(f, i) for i, f in enumerate(form_fields)]

        for key, value in list(form_data.items())[:25]:  # Max 25 fields
            field_obj = next((f for f in normalized_fields if f['id'] == key), None)
            label = field_obj['label'] if field_obj else key
            embed.add_field(name=label, value=value[:1024] if value else '—', inline=False)

    # Send embed and buttons
    view = build_button_rows(False, guild_id)
    await channel.send(embed=embed, view=view)

    # Ping team role
    if team_role_id:
        team_role = interaction.guild.get_role(int(team_role_id))
        if team_role:
            await channel.send(f"{team_role.mention} {t(guild_id, 'ticket.created')}")

    # Respond to user
    if interaction.response.is_done():
        await interaction.followup.send(f"Ticket erstellt: {channel.mention}", ephemeral=True)
    else:
        await interaction.response.send_message(f"Ticket erstellt: {channel.mention}", ephemeral=True)

    # Save ticket
    tickets = config.load_tickets(guild_id)
    tickets.append({
        'id': ticket_number,
        'channelId': str(channel.id),
        'userId': str(interaction.user.id),
        'topic': topic['value'],
        'status': 'offen',
        'priority': 0,
        'timestamp': int(datetime.now().timestamp() * 1000),
        'formData': form_data,
        'addedUsers': []
    })
    config.save_tickets(guild_id, tickets)

    # Log event
    await log_event(
        interaction.guild,
        t(guild_id, 'logs.ticket_created', {
            'id': str(ticket_number),
            'user': interaction.user.mention,
            'topic': topic['label']
        })
    )

    # Reset panel message
    try:
        panel_message_id = cfg.get('panelMessageId')
        panel_channel_id = cfg.get('panelChannelId')

        if panel_message_id and panel_channel_id:
            panel_channel = await interaction.guild.fetch_channel(int(panel_channel_id))
            panel_message = await panel_channel.fetch_message(int(panel_message_id))

            panel_embed = build_panel_embed(cfg)
            panel_view = build_panel_select(cfg)

            await panel_message.edit(
                embed=panel_embed,
                view=panel_view
            )
    except Exception as e:
        print(f"Error resetting panel: {e}")


# ==================== Bot Events ====================

@bot.event
async def on_ready():
    """Bot ready event."""
    print(f"🤖 {bot.user.name} ist bereit!")
    print(f"📦 Version: {VERSION}")

    # Sync commands
    try:
        synced = await bot.tree.sync()
        print(f"✅ {len(synced)} Commands synchronisiert")
    except Exception as e:
        print(f"❌ Command-Sync Fehler: {e}")


@bot.event
async def on_guild_join(guild: discord.Guild):
    """Bot joins a new guild."""
    print(f"🆕 Bot beigetreten: {guild.name} ({guild.id})")

    # Sync commands for this guild
    try:
        await bot.tree.sync(guild=guild)
        print(f"✅ Commands deployed to {guild.name}")
    except Exception as e:
        print(f"❌ Error deploying commands: {e}")


@bot.event
async def on_interaction(interaction: discord.Interaction):
    """Handle all interactions (buttons, selects, modals)."""
    try:
        guild_id = str(interaction.guild.id)
        cfg = config.read_config(guild_id)

        # Topic Select Menu
        if interaction.data.get('custom_id') == 'topic':
            await handle_topic_select(interaction, cfg)
            return

        # Modal Submit
        if interaction.type == discord.InteractionType.modal_submit:
            await handle_modal_submit(interaction, cfg)
            return

        # Buttons
        if interaction.data.get('component_type') == 2:  # Button
            await handle_button_click(interaction, cfg)
            return

    except Exception as e:
        print(f"Interaction error: {e}")
        if not interaction.response.is_done():
            await interaction.response.send_message("Fehler bei der Verarbeitung", ephemeral=True)


async def handle_topic_select(interaction: discord.Interaction, cfg: Dict[str, Any]):
    """Handle topic selection from select menu."""
    guild_id = str(interaction.guild.id)
    topic_value = interaction.data['values'][0]

    if topic_value == 'none':
        await interaction.response.send_message(
            '⚠️ Keine Topics konfiguriert. Bitte konfiguriere zuerst Topics im Panel.',
            ephemeral=True
        )
        return

    # Find topic
    topic = next((t for t in cfg.get('topics', []) if t.get('value') == topic_value), None)
    if not topic:
        await interaction.response.send_message('Unbekanntes Thema', ephemeral=True)
        return

    # Get form fields
    form_fields = get_form_fields_for_topic(cfg, topic_value)

    # Reset panel message first
    try:
        panel_embed = build_panel_embed(cfg)
        panel_view = build_panel_select(cfg)
        await interaction.message.edit(embed=panel_embed, view=panel_view)
    except Exception as e:
        print(f"Error resetting panel: {e}")

    if form_fields:
        # Show modal
        modal = discord.ui.Modal(title=f"Ticket: {topic['label']}"[:45])
        modal.custom_id = f"modal_newticket:{topic_value}"

        for i, field in enumerate(form_fields):
            normalized = normalize_field(field, i)

            text_input = discord.ui.TextInput(
                label=normalized['label'],
                custom_id=normalized['id'],
                required=normalized['required'],
                style=discord.TextStyle.paragraph if normalized['style'] == 'paragraph' else discord.TextStyle.short
            )
            modal.add_item(text_input)

        await interaction.response.send_modal(modal)
    else:
        # No form fields, create ticket immediately
        await interaction.response.defer(ephemeral=True)
        await create_ticket_channel(interaction, topic, {}, cfg)


async def handle_modal_submit(interaction: discord.Interaction, cfg: Dict[str, Any]):
    """Handle modal submission."""
    custom_id = interaction.data.get('custom_id', '')

    # New ticket modal
    if custom_id.startswith('modal_newticket:'):
        topic_value = custom_id.split(':')[1]
        topic = next((t for t in cfg.get('topics', []) if t.get('value') == topic_value), None)

        if not topic:
            await interaction.response.send_message('Topic ungültig', ephemeral=True)
            return

        # Extract form answers
        form_fields = get_form_fields_for_topic(cfg, topic_value)
        normalized_fields = [normalize_field(f, i) for i, f in enumerate(form_fields)]

        answers = {}
        for component in interaction.data.get('components', []):
            for item in component.get('components', []):
                custom_id = item.get('custom_id')
                value = item.get('value', '')
                answers[custom_id] = value

        await create_ticket_channel(interaction, topic, answers, cfg)

    # Add user modal
    elif custom_id == 'modal_add_user':
        await handle_add_user_modal(interaction)


async def handle_add_user_modal(interaction: discord.Interaction):
    """Handle add user modal submission."""
    guild_id = str(interaction.guild.id)
    team_role_id = get_team_role(guild_id)

    # Check if user is team
    is_team = False
    if team_role_id:
        team_role = interaction.guild.get_role(int(team_role_id))
        is_team = team_role in interaction.user.roles if team_role else False

    if not is_team:
        await interaction.response.send_message('Nur Team', ephemeral=True)
        return

    # Get user ID from input
    raw_input = ''
    for component in interaction.data.get('components', []):
        for item in component.get('components', []):
            if item.get('custom_id') == 'user':
                raw_input = item.get('value', '').strip()

    # Extract ID
    import re
    match = re.search(r'\d{17,20}', raw_input.replace('<@!', '').replace('<@', '').replace('>', ''))

    if not match:
        await interaction.response.send_message('Ungültige ID', ephemeral=True)
        return

    user_id = match.group(0)

    # Verify member exists
    try:
        member = await interaction.guild.fetch_member(int(user_id))
    except:
        await interaction.response.send_message('Mitglied nicht gefunden', ephemeral=True)
        return

    # Load ticket
    tickets = config.load_tickets(guild_id)
    ticket = next((t for t in tickets if t['channelId'] == str(interaction.channel.id)), None)

    if not ticket:
        await interaction.response.send_message('Kein Ticket-Datensatz', ephemeral=True)
        return

    # Check if already has access
    added_users = ticket.get('addedUsers', [])
    if user_id in added_users or user_id == ticket['userId'] or user_id == ticket.get('claimer'):
        await interaction.response.send_message('Hat bereits Zugriff', ephemeral=True)
        return

    # Add user
    ticket['addedUsers'].append(user_id)
    config.save_tickets(guild_id, tickets)

    # Set permissions
    await interaction.channel.set_permissions(
        member,
        view_channel=True,
        send_messages=True
    )

    await interaction.response.send_message(f"<@{user_id}> hinzugefügt", ephemeral=True)

    # Send message
    team_role = interaction.guild.get_role(int(team_role_id)) if team_role_id else None
    mention = team_role.mention if team_role else ''
    await interaction.channel.send(
        f"➕ <@{user_id}> {t(guild_id, 'messages.user_added_success', {'user': f'<@{user_id}>'}).replace('✅', '')} {mention}"
    )

    await log_event(
        interaction.guild,
        t(guild_id, 'logs.user_added', {'user': f'<@{user_id}>', 'id': str(ticket['id'])})
    )


async def handle_button_click(interaction: discord.Interaction, cfg: Dict[str, Any]):
    """Handle button clicks."""
    custom_id = interaction.data.get('custom_id')
    guild_id = str(interaction.guild.id)

    # Load ticket
    tickets = config.load_tickets(guild_id)
    ticket = next((t for t in tickets if t['channelId'] == str(interaction.channel.id)), None)

    if not ticket:
        await interaction.response.send_message('Kein Ticket-Datensatz', ephemeral=True)
        return

    team_role_id = get_team_role(guild_id)
    is_team = False
    if team_role_id:
        team_role = interaction.guild.get_role(int(team_role_id))
        is_team = team_role in interaction.user.roles if team_role else False

    is_creator = ticket['userId'] == str(interaction.user.id)
    is_claimer = ticket.get('claimer') == str(interaction.user.id)

    # Request Close
    if custom_id == 'request_close':
        team_mention = f"<@&{team_role_id}>" if team_role_id else '@Team'

        view = discord.ui.View(timeout=None)
        team_close_btn = discord.ui.Button(
            custom_id='team_close',
            emoji='🔒',
            label=t(guild_id, 'buttons.close'),
            style=discord.ButtonStyle.danger
        )
        view.add_item(team_close_btn)

        await interaction.channel.send(
            content=f"❓ Schließungsanfrage von {interaction.user.mention} {team_mention}",
            view=view
        )

        await log_event(
            interaction.guild,
            t(guild_id, 'logs.close_requested', {'id': str(ticket['id']), 'user': interaction.user.mention})
        )

        await interaction.response.send_message('Anfrage gesendet', ephemeral=True)
        return

    # Unclaim
    if custom_id == 'unclaim':
        if not is_claimer and not is_team:
            await interaction.response.send_message('Nur der Claimer kann unclaimen', ephemeral=True)
            return

        # Reset permissions
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False)
        }

        # Add creator
        try:
            creator = await interaction.guild.fetch_member(int(ticket['userId']))
            overwrites[creator] = discord.PermissionOverwrite(view_channel=True, send_messages=True)
        except:
            pass

        # Add team role
        if team_role_id:
            team_role = interaction.guild.get_role(int(team_role_id))
            if team_role:
                overwrites[team_role] = discord.PermissionOverwrite(view_channel=True, send_messages=True)

        # Add added users
        for user_id in ticket.get('addedUsers', []):
            try:
                member = await interaction.guild.fetch_member(int(user_id))
                overwrites[member] = discord.PermissionOverwrite(view_channel=True, send_messages=True)
            except:
                pass

        await interaction.channel.edit(overwrites=overwrites)

        # Remove claimer
        if 'claimer' in ticket:
            del ticket['claimer']
        config.save_tickets(guild_id, tickets)

        # Update buttons
        view = build_button_rows(False, guild_id)
        await interaction.response.edit_message(view=view)

        # Send message
        team_mention = f"<@&{team_role_id}>" if team_role_id else ''
        await interaction.channel.send(
            f"🔄 {interaction.user.mention} {t(guild_id, 'messages.ticket_unclaimed', {'user': interaction.user.mention})} {team_mention}"
        )

        await log_event(
            interaction.guild,
            t(guild_id, 'logs.ticket_unclaimed', {'id': str(ticket['id']), 'user': interaction.user.mention})
        )
        return

    # Team-only buttons
    if not is_team:
        await interaction.response.send_message('Nur Team', ephemeral=True)
        return

    # Close / Team Close
    if custom_id in ['close', 'team_close']:
        ticket['status'] = 'geschlossen'
        config.save_tickets(guild_id, tickets)

        await interaction.response.send_message('Ticket wird geschlossen…', ephemeral=True)

        closer = await interaction.guild.fetch_member(interaction.user.id)
        closer_name = closer.display_name if closer else interaction.user.name

        team_role = interaction.guild.get_role(int(team_role_id)) if team_role_id else None
        team_label = f"@{team_role.name}" if team_role else '@Team'

        await interaction.channel.send(f"🔒 Ticket geschlossen von {closer_name} • {team_label}")

        # Create transcript
        try:
            transcript_files = await create_transcript(interaction.channel, ticket, resolve_mentions=True)

            transcript_channel_id = cfg.get('transcriptChannelId') or cfg.get('logChannelId')
            if transcript_channel_id:
                transcript_channel = await interaction.guild.fetch_channel(int(transcript_channel_id))
                if transcript_channel:
                    transcript_url = PANEL_URL.replace('/panel', f"/transcript/{ticket['id']}")

                    files = [
                        discord.File(transcript_files['txt']),
                        discord.File(transcript_files['html'])
                    ]

                    view = discord.ui.View()
                    view.add_item(
                        discord.ui.Button(
                            label='📄 Transcript ansehen',
                            url=transcript_url,
                            style=discord.ButtonStyle.link
                        )
                    )

                    await transcript_channel.send(
                        content=f"📁 Transcript Ticket #{ticket['id']}",
                        files=files,
                        view=view
                    )
        except Exception as e:
            print(f"Transcript error: {e}")

        await log_event(
            interaction.guild,
            t(guild_id, 'logs.ticket_closed', {'id': str(ticket['id']), 'user': closer_name})
        )

        await asyncio.sleep(2.5)
        await interaction.channel.delete()
        return

    # Claim
    if custom_id == 'claim':
        ticket['claimer'] = str(interaction.user.id)
        config.save_tickets(guild_id, tickets)

        # Set permissions
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False)
        }

        # Add creator
        try:
            creator = await interaction.guild.fetch_member(int(ticket['userId']))
            overwrites[creator] = discord.PermissionOverwrite(view_channel=True, send_messages=True)
        except:
            pass

        # Add claimer
        overwrites[interaction.user] = discord.PermissionOverwrite(view_channel=True, send_messages=True)

        # Add team role
        if team_role_id:
            team_role = interaction.guild.get_role(int(team_role_id))
            if team_role:
                overwrites[team_role] = discord.PermissionOverwrite(view_channel=True, send_messages=True)

        # Add added users
        for user_id in ticket.get('addedUsers', []):
            try:
                member = await interaction.guild.fetch_member(int(user_id))
                overwrites[member] = discord.PermissionOverwrite(view_channel=True, send_messages=True)
            except:
                pass

        await interaction.channel.edit(overwrites=overwrites)

        # Update buttons
        view = build_button_rows(True, guild_id)
        await interaction.response.edit_message(view=view)

        # Send message
        team_mention = f"<@&{team_role_id}>" if team_role_id else ''
        await interaction.channel.send(
            f"✅ {interaction.user.mention} {t(guild_id, 'messages.ticket_claimed', {'user': interaction.user.mention})} {team_mention}"
        )

        await log_event(
            interaction.guild,
            t(guild_id, 'logs.ticket_claimed', {'id': str(ticket['id']), 'user': interaction.user.mention})
        )

    # Priority Up
    elif custom_id == 'priority_up':
        ticket['priority'] = min(2, ticket.get('priority', 0) + 1)
        config.save_tickets(guild_id, tickets)

        await rename_channel_if_needed(interaction.channel, ticket)

        state = PRIORITY_STATES[ticket['priority']]

        # Update embed color
        try:
            async for message in interaction.channel.history(limit=10):
                if message.embeds:
                    embed = message.embeds[0]
                    embed.color = state['embedColor']
                    await message.edit(embed=embed)
                    break
        except:
            pass

        await interaction.response.send_message(f"Priorität: {state['label']}", ephemeral=True)

        # Send message
        team_mention = f"<@&{team_role_id}>" if team_role_id else ''
        await interaction.channel.send(
            f"{team_mention} {t(guild_id, 'messages.priority_changed', {'priority': state['label']})}"
        )

        await log_event(
            interaction.guild,
            t(guild_id, 'logs.priority_changed', {'id': str(ticket['id']), 'direction': 'hoch', 'priority': state['label']})
        )

    # Priority Down
    elif custom_id == 'priority_down':
        ticket['priority'] = max(0, ticket.get('priority', 0) - 1)
        config.save_tickets(guild_id, tickets)

        await rename_channel_if_needed(interaction.channel, ticket)

        state = PRIORITY_STATES[ticket['priority']]

        # Update embed color
        try:
            async for message in interaction.channel.history(limit=10):
                if message.embeds:
                    embed = message.embeds[0]
                    embed.color = state['embedColor']
                    await message.edit(embed=embed)
                    break
        except:
            pass

        await interaction.response.send_message(f"Priorität: {state['label']}", ephemeral=True)

        # Send message
        team_mention = f"<@&{team_role_id}>" if team_role_id else ''
        await interaction.channel.send(
            f"{team_mention} {t(guild_id, 'messages.priority_changed', {'priority': state['label']})}"
        )

        await log_event(
            interaction.guild,
            t(guild_id, 'logs.priority_changed', {'id': str(ticket['id']), 'direction': 'herab', 'priority': state['label']})
        )

    # Add User
    elif custom_id == 'add_user':
        modal = discord.ui.Modal(title='Nutzer hinzufügen')
        modal.custom_id = 'modal_add_user'

        text_input = discord.ui.TextInput(
            label='User @ oder ID',
            custom_id='user',
            required=True,
            style=discord.TextStyle.short
        )
        modal.add_item(text_input)

        await interaction.response.send_modal(modal)


@bot.event
async def on_message(message: discord.Message):
    """Message event for unauthorized user detection."""
    if message.author.bot:
        return

    if not message.channel.name or not message.channel.name.startswith(PREFIX):
        return

    guild_id = str(message.guild.id)
    tickets = config.load_tickets(guild_id)
    ticket = next((t for t in tickets if t['channelId'] == str(message.channel.id)), None)

    if not ticket or not ticket.get('claimer'):
        return

    # Check permissions
    author_id = str(message.author.id)
    is_creator = ticket['userId'] == author_id
    is_claimer = ticket.get('claimer') == author_id
    is_added = author_id in ticket.get('addedUsers', [])

    team_role_id = get_team_role(guild_id)
    is_team = False
    if team_role_id:
        team_role = message.guild.get_role(int(team_role_id))
        is_team = team_role in message.author.roles if team_role else False

    # Delete unauthorized messages
    if not (is_creator or is_claimer or is_added or is_team):
        await message.delete()

        # Send DM
        try:
            await message.author.send(
                f"❌ Du hast keine Berechtigung in Ticket #{ticket['id']} zu schreiben. "
                f"Dieses Ticket wurde geclaimed und ist nur für Ersteller, Claimer, "
                f"hinzugefügte Nutzer und Team-Mitglieder zugänglich."
            )
        except:
            pass


# ==================== Slash Commands ====================

@bot.tree.command(name="dashboard", description="Zeigt den Link zum Dashboard an")
async def dashboard_command(interaction: discord.Interaction):
    """Dashboard command."""
    await interaction.response.send_message(
        f"🌐 **Dashboard**: {PANEL_URL}",
        ephemeral=True
    )


@bot.tree.command(name="setlanguage", description="Ändere die Sprache des Bots")
@app_commands.describe(language="Wähle eine Sprache")
@app_commands.choices(language=[
    app_commands.Choice(name="Deutsch", value="de"),
    app_commands.Choice(name="English", value="en"),
    app_commands.Choice(name="עברית", value="he")
])
async def setlanguage_command(interaction: discord.Interaction, language: str):
    """Set language command."""
    guild_id = str(interaction.guild.id)

    # Check admin permission
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            t(guild_id, 'language.only_admin'),
            ephemeral=True
        )
        return

    set_guild_language(guild_id, language)
    lang_name = get_language_name(language)

    await interaction.response.send_message(
        t(guild_id, 'language.updated', {'language': lang_name}),
        ephemeral=False
    )


@bot.tree.command(name="version", description="Show current bot version")
async def version_command(interaction: discord.Interaction):
    """Display bot version and changelog."""
    embed = discord.Embed(
        title='🤖 TRS Tickets Bot',
        description=(
            f"**Version:** {VERSION}\n"
            f"**Release Date:** 2025-10-12\n\n"
            f"**New in {VERSION}:**\n"
            "🔧 GitHub Commit Logs Toggle System\n"
            "👥 Multi-Level Priority Roles (Green/Orange/Red)\n"
            "👀 Live Preview for Role Count per Priority\n"
            "⚙️ Server-specific GitHub Logs Configuration\n"
            "🎛️ Interactive Toggle Buttons for GitHub Notifications\n"
            "🛡️ Multiple Role Selection per Priority Level\n\n"
            "[GitHub Repository](https://github.com/TheRedstoneE/TRS-Tickets-Bot)"
        ),
        color=0x00ff88,
        timestamp=datetime.now()
    )
    embed.set_footer(text='TRS Tickets ©️')

    await interaction.response.send_message(embed=embed, ephemeral=False)


@bot.tree.command(name="github-commits", description="Toggle GitHub commit logging for this server")
async def github_commits_command(interaction: discord.Interaction):
    """Toggle GitHub commit logging."""
    guild_id = str(interaction.guild.id)

    # Check admin permission
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            t(guild_id, 'language.only_admin') or '❌ Only administrators can use this command.',
            ephemeral=True
        )
        return

    cfg = config.read_config(guild_id)

    # Default: enabled
    current_status = cfg.get('githubCommitsEnabled', True)

    # Toggle status
    cfg['githubCommitsEnabled'] = not current_status
    config.write_config(guild_id, cfg)

    new_status = cfg['githubCommitsEnabled']

    # Create status embed
    embed = discord.Embed(
        title='⚙️ GitHub Commit Logs',
        description=(
            f"**Status Updated:** {':white_check_mark: Enabled' if new_status else ':x: Disabled'}\n\n"
            f"GitHub commit notifications will {'now ' if new_status else 'no longer '}be logged to this server.\n\n"
            f"{f'**Log Channel:** <#{cfg.get(\"githubWebhookChannelId\")}>' if cfg.get('githubWebhookChannelId') else ':warning: **No log channel set!** Please configure a channel in the panel.'}"
        ),
        color=0x00ff88 if new_status else 0xff4444,
        timestamp=datetime.now()
    )
    embed.set_footer(text='TRS Tickets ©️')

    await interaction.response.send_message(embed=embed, ephemeral=False)

    print(f"📝 GitHub Commits {'enabled' if new_status else 'disabled'} on {interaction.guild.name} by {interaction.user.name}")


@bot.tree.command(name="reload", description="Reload bot configuration")
async def reload_command(interaction: discord.Interaction):
    """Reload bot configuration and clear caches."""
    guild_id = str(interaction.guild.id)

    # Check admin permission
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            t(guild_id, 'language.only_admin') or '❌ Only administrators can use this command.',
            ephemeral=True
        )
        return

    try:
        # Reload config module
        import importlib
        importlib.reload(config)

        # Reload translations
        from utils import translations
        importlib.reload(translations)

        # Reload helpers
        from utils import helpers
        importlib.reload(helpers)

        await interaction.response.send_message(
            "✅ **Reload Erfolgreich!**\n"
            "📦 Module neu geladen\n"
            "⚙️ Config-Cache aktualisiert\n"
            "🔄 Bot läuft weiter ohne Neustart",
            ephemeral=True
        )

        print(f"🔄 Reload durchgeführt von {interaction.user.name} auf Server {interaction.guild.name}")

    except Exception as e:
        await interaction.response.send_message(
            f"❌ **Fehler beim Neuladen:**\n```{str(e)}```",
            ephemeral=True
        )
        print(f"Reload Error: {e}")


@bot.tree.command(name="restart", description="Restart the bot")
async def restart_command(interaction: discord.Interaction):
    """Restart the bot with clean exit."""
    guild_id = str(interaction.guild.id)

    # Check admin permission
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            t(guild_id, 'language.only_admin') or '❌ Only administrators can use this command.',
            ephemeral=True
        )
        return

    embed = discord.Embed(
        title='🔄 Bot Restart',
        description=(
            '**Bot wird neu gestartet...**\n\n'
            '⏱️ Erwartete Downtime: ~5-10 Sekunden\n'
            '✅ Alle Konfigurationen bleiben erhalten\n'
            '📝 Commands werden automatisch neu registriert\n\n'
            f'Angefordert von: {interaction.user.mention}'
        ),
        color=0xff9900,
        timestamp=datetime.now()
    )
    embed.set_footer(text='TRS Tickets ©️')

    await interaction.response.send_message(embed=embed, ephemeral=False)

    print(f"⚠️ RESTART angefordert von {interaction.user.name} ({interaction.user.id}) auf Server {interaction.guild.name} ({guild_id})")

    # Exit with clean code (PM2/Docker should auto-restart)
    await asyncio.sleep(2)
    await bot.close()
    exit(0)


# ==================== Run Bot ====================

if __name__ == "__main__":
    if not TOKEN:
        print("❌ DISCORD_TOKEN nicht gefunden in .env")
    else:
        bot.run(TOKEN)
