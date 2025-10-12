"""
TRS Tickets Discord Bot
Version: 0.3.0
Discord.py implementation
"""

import discord
from discord import app_commands
from discord.ext import commands
import json
import os
from datetime import datetime
from pathlib import Path
import asyncio

# Intents
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True

class TicketBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=intents,
            application_id=os.getenv('CLIENT_ID')
        )

        # Paths
        self.config_dir = Path(__file__).parent.parent / 'configs'
        self.data_dir = Path(__file__).parent.parent / 'data'
        self.transcripts_dir = Path(__file__).parent.parent / 'transcripts'

        # Create directories
        self.config_dir.mkdir(exist_ok=True)
        self.data_dir.mkdir(exist_ok=True)
        self.transcripts_dir.mkdir(exist_ok=True)

    async def setup_hook(self):
        """Setup bot commands"""
        await self.tree.sync()

    def load_config(self, guild_id: int) -> dict:
        """Load guild configuration"""
        config_file = self.config_dir / f'{guild_id}.json'
        if not config_file.exists():
            return {
                'guildId': str(guild_id),
                'topics': [],
                'formFields': [],
                'ticketCategoryId': '',
                'logChannelId': '',
                'teamRoleId': ''
            }

        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_config(self, guild_id: int, config: dict):
        """Save guild configuration"""
        config_file = self.config_dir / f'{guild_id}.json'
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

    def load_tickets(self, guild_id: int) -> list:
        """Load guild tickets"""
        tickets_file = self.data_dir / f'{guild_id}_tickets.json'
        if not tickets_file.exists():
            return []

        with open(tickets_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_tickets(self, guild_id: int, tickets: list):
        """Save guild tickets"""
        tickets_file = self.data_dir / f'{guild_id}_tickets.json'
        with open(tickets_file, 'w', encoding='utf-8') as f:
            json.dump(tickets, f, indent=2, ensure_ascii=False)

    def get_next_ticket_id(self, guild_id: int) -> int:
        """Get next ticket ID"""
        tickets = self.load_tickets(guild_id)
        if not tickets:
            return 1
        return max(t['id'] for t in tickets) + 1

# Create bot instance
bot = TicketBot()

@bot.event
async def on_ready():
    print(f'{bot.user} is ready!')
    print(f'Servers: {len(bot.guilds)}')
    print('------')

# Dashboard command
@bot.tree.command(name="dashboard", description="Get the admin panel link")
async def dashboard(interaction: discord.Interaction):
    """Dashboard command"""
    panel_url = os.getenv('PANEL_URL', 'http://localhost:3000')

    embed = discord.Embed(
        title="🎫 TRS Tickets Admin Panel",
        description=f"[Open Admin Panel]({panel_url})",
        color=discord.Color.green()
    )
    embed.add_field(
        name="Features",
        value="• Configure topics and forms\n• View ticket history\n• Manage server settings",
        inline=False
    )

    await interaction.response.send_message(embed=embed, ephemeral=True)

# Topic selection handler
@bot.event
async def on_interaction(interaction: discord.Interaction):
    if interaction.type != discord.InteractionType.component:
        return

    # Handle topic selection
    if interaction.data['custom_id'] == 'topic':
        await handle_topic_selection(interaction)

async def handle_topic_selection(interaction: discord.Interaction):
    """Handle topic selection from dropdown"""
    guild_id = interaction.guild_id
    user = interaction.user
    topic_value = interaction.data['values'][0]

    # Load config
    config = bot.load_config(guild_id)

    # Find topic
    topic = next((t for t in config['topics'] if t['value'] == topic_value), None)
    if not topic:
        await interaction.response.send_message(
            "❌ Topic not found!", ephemeral=True
        )
        return

    # Get form fields for this topic
    form_fields = [
        f for f in config.get('formFields', [])
        if f.get('topic') == topic_value or not f.get('topic')
    ]

    # If has form fields, show modal
    if form_fields:
        await show_ticket_form(interaction, topic, form_fields)
    else:
        await create_ticket(interaction, topic, {})

async def show_ticket_form(interaction: discord.Interaction, topic: dict, fields: list):
    """Show ticket form modal"""
    modal = discord.ui.Modal(title=f"Ticket: {topic['label']}")

    # Add form fields (max 5)
    for field in fields[:5]:
        text_input = discord.ui.TextInput(
            label=field['label'],
            placeholder=field.get('placeholder', ''),
            required=field.get('required', False),
            style=discord.TextStyle.paragraph if field.get('type') == 'paragraph' else discord.TextStyle.short
        )
        modal.add_item(text_input)

    # Store topic in modal
    modal.topic = topic
    modal.on_submit = lambda inter: handle_form_submit(inter, topic)

    await interaction.response.send_modal(modal)

async def handle_form_submit(interaction: discord.Interaction, topic: dict):
    """Handle form submission"""
    form_data = {}

    # Extract form data
    for component in interaction.data['components']:
        for item in component['components']:
            form_data[item['custom_id']] = item['value']

    await create_ticket(interaction, topic, form_data)

async def create_ticket(interaction: discord.Interaction, topic: dict, form_data: dict):
    """Create a new ticket"""
    guild = interaction.guild
    user = interaction.user
    config = bot.load_config(guild.id)

    # Get ticket category
    category_id = config.get('ticketCategoryId')
    if not category_id:
        await interaction.response.send_message(
            "❌ Ticket category not configured!", ephemeral=True
        )
        return

    category = guild.get_channel(int(category_id))
    if not category:
        await interaction.response.send_message(
            "❌ Ticket category not found!", ephemeral=True
        )
        return

    # Get next ticket ID
    ticket_id = bot.get_next_ticket_id(guild.id)

    # Create ticket channel
    channel_name = f"🎫│🟢ticket-{ticket_id:05d}"

    # Get team role
    team_role_id = config.get('teamRoleId')
    team_role = guild.get_role(int(team_role_id)) if team_role_id else None

    # Set permissions
    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        user: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)
    }

    if team_role:
        overwrites[team_role] = discord.PermissionOverwrite(
            view_channel=True, send_messages=True, read_message_history=True
        )

    channel = await category.create_text_channel(
        name=channel_name,
        overwrites=overwrites
    )

    # Create ticket embed
    embed_config = config.get('ticketEmbed', {})
    embed_title = embed_config.get('title', '🎫 Ticket #{ticketNumber}').format(
        ticketNumber=ticket_id,
        topicLabel=topic['label'],
        topicValue=topic['value']
    )
    embed_desc = embed_config.get('description', 'Hallo {userMention}').format(
        userMention=user.mention,
        userId=user.id,
        topicLabel=topic['label'],
        topicValue=topic['value']
    )

    embed = discord.Embed(
        title=embed_title,
        description=embed_desc,
        color=int(embed_config.get('color', '#2b90d9').replace('#', ''), 16),
        timestamp=datetime.utcnow()
    )

    # Add form data as fields
    for key, value in form_data.items():
        embed.add_field(name=key, value=value, inline=False)

    embed.set_footer(text=embed_config.get('footer', 'TRS Tickets ©️'))

    # Add buttons
    view = TicketControlView()

    await channel.send(embed=embed, view=view)

    # Save ticket data
    tickets = bot.load_tickets(guild.id)
    tickets.append({
        'id': ticket_id,
        'channelId': str(channel.id),
        'userId': str(user.id),
        'topic': topic['value'],
        'status': 'offen',
        'priority': 0,
        'timestamp': datetime.utcnow().isoformat(),
        'formData': form_data,
        'claimer': None
    })
    bot.save_tickets(guild.id, tickets)

    # Send confirmation
    await interaction.response.send_message(
        f"✅ Ticket created: {channel.mention}",
        ephemeral=True
    )

# Ticket Control Buttons
class TicketControlView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Close", style=discord.ButtonStyle.danger, custom_id="close_ticket")
    async def close_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Close ticket"""
        await interaction.response.send_message("🔒 Ticket wird geschlossen...", ephemeral=True)
        # TODO: Implement ticket closing logic

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.primary, custom_id="claim_ticket")
    async def claim_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Claim ticket"""
        await interaction.response.send_message("✅ Ticket claimed!", ephemeral=True)
        # TODO: Implement claim logic

# Run bot
if __name__ == "__main__":
    import os
    from dotenv import load_dotenv

    load_dotenv()
    token = os.getenv('DISCORD_TOKEN')

    if not token:
        print("ERROR: DISCORD_TOKEN not found in .env file")
        exit(1)

    bot.run(token)
