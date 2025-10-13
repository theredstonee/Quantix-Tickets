"""
Flask Web Panel for TRS Tickets Bot
Ported from Express.js panel.js
"""

import os
import json
import asyncio
from pathlib import Path
from datetime import datetime
from functools import wraps

from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_file
from flask_session import Session
from requests_oauthlib import OAuth2Session
from dotenv import load_dotenv
import discord
from discord import Embed, SelectOption

# Load environment
load_dotenv()

# Config
CLIENT_ID = os.getenv('CLIENT_ID')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
BASE_URL = os.getenv('PUBLIC_BASE_URL', 'http://localhost:3000')
SESSION_SECRET = os.getenv('SESSION_SECRET', 'ticketbotsecret')
REDIRECT_URI = f"{BASE_URL.rstrip('/')}/auth/discord/callback"

VERSION = 'Beta 0.3.2'

# OAuth2 Config
DISCORD_API_BASE = 'https://discord.com/api/v10'
AUTHORIZATION_BASE_URL = f'{DISCORD_API_BASE}/oauth2/authorize'
TOKEN_URL = f'{DISCORD_API_BASE}/oauth2/token'
SCOPE = ['identify', 'guilds', 'guilds.members.read']

# Paths
CONFIG_DIR = Path(__file__).parent / 'configs'
CONFIG_DIR.mkdir(exist_ok=True)
LEGACY_CONFIG = Path(__file__).parent / 'config.json'

# ==================== Config Helpers ====================

def read_config(guild_id=None):
    """Read guild-specific or legacy config."""
    try:
        if not guild_id:
            # Legacy fallback
            if LEGACY_CONFIG.exists():
                return json.loads(LEGACY_CONFIG.read_text('utf-8'))
            return {}

        config_path = CONFIG_DIR / f"{guild_id}.json"
        if config_path.exists():
            return json.loads(config_path.read_text('utf-8'))

        # Create default config
        default_cfg = {
            'guildId': guild_id,
            'topics': [],
            'formFields': [],
            'teamRoleId': '1387525699908272218',
            'ticketEmbed': {
                'title': '🎫 Ticket #{ticketNumber}',
                'description': 'Hallo {userMention}\n**Thema:** {topicLabel}',
                'color': '#2b90d9',
                'footer': 'TRS Tickets ©️'
            },
            'panelEmbed': {
                'title': '🎫 Ticket System',
                'description': 'Wähle dein Thema',
                'color': '#5865F2',
                'footer': 'TRS Tickets ©️'
            }
        }
        write_config(guild_id, default_cfg)
        return default_cfg
    except Exception as e:
        print(f"readConfig error: {e}")
        return {}


def write_config(guild_id, data):
    """Write guild-specific or legacy config."""
    try:
        if not guild_id:
            LEGACY_CONFIG.write_text(json.dumps(data, indent=2), 'utf-8')
            return

        config_path = CONFIG_DIR / f"{guild_id}.json"
        config_path.write_text(json.dumps(data, indent=2), 'utf-8')
    except Exception as e:
        print(f"writeConfig error: {e}")


def load_tickets(guild_id):
    """Load tickets for guild."""
    if not guild_id:
        tickets_path = Path(__file__).parent / 'tickets.json'
    else:
        tickets_path = CONFIG_DIR / f"{guild_id}_tickets.json"

    try:
        if tickets_path.exists():
            return json.loads(tickets_path.read_text('utf-8'))
        return []
    except:
        return []


# ==================== Flask App ====================

app = Flask(__name__)
app.secret_key = SESSION_SECRET
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = False
Session(app)

# Global Discord client (will be set from main.py)
discord_client = None


def set_discord_client(client):
    """Set Discord client instance."""
    global discord_client
    discord_client = client


# ==================== OAuth2 Helpers ====================

def get_discord_session(token=None, state=None):
    """Get OAuth2 session."""
    return OAuth2Session(
        CLIENT_ID,
        redirect_uri=REDIRECT_URI,
        scope=SCOPE,
        state=state,
        token=token
    )


def get_user_guilds(token):
    """Fetch user's guilds from Discord API."""
    discord_session = get_discord_session(token=token)
    r = discord_session.get(f'{DISCORD_API_BASE}/users/@me/guilds')
    if r.status_code == 200:
        return r.json()
    return []


def get_user_info(token):
    """Fetch user info from Discord API."""
    discord_session = get_discord_session(token=token)
    r = discord_session.get(f'{DISCORD_API_BASE}/users/@me')
    if r.status_code == 200:
        return r.json()
    return None


# ==================== Auth Decorators ====================

def require_auth(f):
    """Require authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('login'))

        # Check if guild is selected
        if 'selected_guild' not in session:
            return redirect(url_for('select_server'))

        # Verify user has admin on guild
        guilds = session.get('guilds', [])
        guild_id = session.get('selected_guild')
        guild_entry = next((g for g in guilds if g['id'] == guild_id), None)

        if not guild_entry:
            return ('Du bist nicht auf diesem Server oder der Bot ist nicht auf dem Server.', 403)

        # Check admin permission
        ADMIN = 0x8
        if not (int(guild_entry['permissions']) & ADMIN):
            return ('Keine Berechtigung. Du brauchst Administrator-Rechte auf diesem Server.', 403)

        return f(*args, **kwargs)
    return decorated


# ==================== Async Helper ====================

def run_async(coro):
    """Run async coroutine in sync context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ==================== Routes ====================

@app.route('/')
def home():
    """Home page."""
    is_authenticated = 'token' in session
    user = session.get('user')
    return render_template('home.html',
                          isAuthenticated=is_authenticated,
                          user=user,
                          version=VERSION)


@app.route('/login')
def login():
    """Login with Discord."""
    if 'token' in session:
        return redirect(url_for('panel'))

    # Rate limit check
    now = datetime.now().timestamp()
    last_attempt = session.get('last_login_attempt', 0)
    if now - last_attempt < 4:
        return ('Zu viele Login-Versuche – bitte 4s warten. <a href="/">Zurück</a>', 429)

    session['last_login_attempt'] = now

    discord_session = get_discord_session()
    authorization_url, state = discord_session.authorization_url(AUTHORIZATION_BASE_URL)
    session['oauth_state'] = state
    return redirect(authorization_url)


@app.route('/auth/discord/callback')
def oauth_callback():
    """OAuth callback."""
    if request.values.get('error'):
        return redirect(url_for('home'))

    try:
        discord_session = get_discord_session(state=session.get('oauth_state'))
        token = discord_session.fetch_token(
            TOKEN_URL,
            client_secret=CLIENT_SECRET,
            authorization_response=request.url
        )

        session['token'] = token

        # Fetch user info and guilds
        user = get_user_info(token)
        guilds = get_user_guilds(token)

        if user:
            session['user'] = user
        if guilds:
            session['guilds'] = guilds

        return redirect(url_for('select_server'))
    except Exception as e:
        print(f"OAuth error: {e}")
        return ('OAuth Fehler.', 500)


@app.route('/logout')
def logout():
    """Logout."""
    session.clear()
    return redirect(url_for('home'))


@app.route('/select-server', methods=['GET', 'POST'])
def select_server():
    """Select server."""
    if 'token' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        guild_id = request.form.get('guildId')
        if not guild_id:
            return redirect(url_for('select_server'))

        # Check admin
        guilds = session.get('guilds', [])
        guild_entry = next((g for g in guilds if g['id'] == guild_id), None)
        ADMIN = 0x8
        if not guild_entry or not (int(guild_entry['permissions']) & ADMIN):
            return ('Keine Administrator-Rechte auf diesem Server.', 403)

        session['selected_guild'] = guild_id
        return redirect(url_for('panel'))

    # GET - show server list
    try:
        guilds = session.get('guilds', [])

        # Get bot guild IDs
        if discord_client:
            bot_guild_ids = {str(g.id) for g in discord_client.guilds}
        else:
            bot_guild_ids = set()

        # Filter: user is admin AND bot is on server
        ADMIN = 0x8
        available_servers = []
        for g in guilds:
            has_bot = g['id'] in bot_guild_ids
            is_admin = (int(g['permissions']) & ADMIN) == ADMIN
            if has_bot and is_admin:
                available_servers.append({
                    'id': g['id'],
                    'name': g['name'],
                    'icon': f"https://cdn.discordapp.com/icons/{g['id']}/{g['icon']}.png" if g.get('icon') else None
                })

        if not available_servers:
            return '<h1>Keine Server verfügbar</h1><p>Du bist auf keinem Server Administrator wo der Bot ist.</p><p><a href="/logout">Logout</a></p>'

        return render_template('select_server.html',
                             servers=available_servers,
                             version=VERSION,
                             currentGuild=session.get('selected_guild'))
    except Exception as e:
        print(f"Server selection error: {e}")
        return ('Fehler beim Laden der Server', 500)


@app.route('/panel', methods=['GET', 'POST'])
@require_auth
def panel():
    """Admin panel."""
    guild_id = session.get('selected_guild')
    cfg = read_config(guild_id)

    if request.method == 'POST':
        # Save config
        try:
            # Server settings
            cfg['guildId'] = guild_id
            if request.form.get('ticketCategoryId'):
                cfg['ticketCategoryId'] = request.form.get('ticketCategoryId').strip()
            if request.form.get('logChannelId'):
                cfg['logChannelId'] = request.form.get('logChannelId').strip()
            if request.form.get('transcriptChannelId'):
                cfg['transcriptChannelId'] = request.form.get('transcriptChannelId').strip()
            if request.form.get('teamRoleId'):
                cfg['teamRoleId'] = request.form.get('teamRoleId').strip()

            # Priority roles
            if 'priorityRoles' not in cfg:
                cfg['priorityRoles'] = {'0': [], '1': [], '2': []}

            cfg['priorityRoles']['0'] = request.form.getlist('priorityRoles_0')
            cfg['priorityRoles']['1'] = request.form.getlist('priorityRoles_1')
            cfg['priorityRoles']['2'] = request.form.getlist('priorityRoles_2')

            # GitHub webhook
            cfg['githubWebhookChannelId'] = request.form.get('githubWebhookChannelId', '').strip() or None

            # Topics
            labels = request.form.getlist('label')
            values = request.form.getlist('value')
            emojis = request.form.getlist('emoji')

            topics = []
            for i, label in enumerate(labels):
                label = label.strip()
                if not label:
                    continue
                value = values[i].strip() if i < len(values) and values[i].strip() else label.lower().replace(' ', '-')
                emoji = emojis[i].strip() if i < len(emojis) else ''
                topics.append({'label': label, 'value': value, 'emoji': emoji or None})

            if topics:
                cfg['topics'] = topics
            else:
                # Try JSON
                topics_json = request.form.get('topicsJson', '').strip()
                if topics_json:
                    try:
                        parsed = json.loads(topics_json)
                        if isinstance(parsed, list):
                            cfg['topics'] = parsed
                    except:
                        pass

            # Form fields
            form_fields_json = request.form.get('formFieldsJson', '').strip()
            if form_fields_json:
                try:
                    ff = json.loads(form_fields_json)
                    cfg['formFields'] = ff if isinstance(ff, list) else []
                except:
                    cfg['formFields'] = []

            # Embeds
            def ensure_hex(s, fallback='#2b90d9'):
                s = (s or '').strip()
                import re
                if re.match(r'^#?[0-9a-fA-F]{6}$', s):
                    return s if s.startswith('#') else f'#{s}'
                return fallback

            # Ticket embed
            cfg['ticketEmbed'] = {
                'title': request.form.get('embedTitle', cfg.get('ticketEmbed', {}).get('title', '')),
                'description': request.form.get('embedDescription', cfg.get('ticketEmbed', {}).get('description', '')),
                'color': ensure_hex(request.form.get('embedColor', cfg.get('ticketEmbed', {}).get('color', '#2b90d9'))),
                'footer': request.form.get('embedFooter', cfg.get('ticketEmbed', {}).get('footer', ''))
            }

            # Panel embed
            cfg['panelEmbed'] = {
                'title': request.form.get('panelTitle', cfg.get('panelEmbed', {}).get('title', '')),
                'description': request.form.get('panelDescription', cfg.get('panelEmbed', {}).get('description', '')),
                'color': ensure_hex(request.form.get('panelColor', cfg.get('panelEmbed', {}).get('color', '#5865F2'))),
                'footer': request.form.get('panelFooter', cfg.get('panelEmbed', {}).get('footer', ''))
            }

            write_config(guild_id, cfg)
            return redirect(url_for('panel', msg='saved'))
        except Exception as e:
            print(f"Panel save error: {e}")
            return redirect(url_for('panel', msg='error'))

    # GET - show panel
    try:
        if not discord_client:
            return ('Discord client not initialized', 500)

        guild = discord_client.get_guild(int(guild_id))
        if not guild:
            return ('Guild not found', 404)

        # Get channels and roles
        channels = [
            {'id': str(ch.id), 'name': ch.name, 'type': ch.type.value}
            for ch in guild.channels
            if ch.type.value in [0, 4]  # Text channels and categories
        ]
        channels.sort(key=lambda x: x['name'])

        roles = [
            {'id': str(r.id), 'name': r.name, 'color': str(r.color)}
            for r in guild.roles
            if r.id != guild.id  # Exclude @everyone
        ]
        roles.sort(key=lambda x: x['name'])

        return render_template('panel.html',
                             cfg=cfg,
                             channels=channels,
                             roles=roles,
                             guildName=guild.name,
                             guildId=guild_id,
                             version=VERSION,
                             msg=request.args.get('msg'))
    except Exception as e:
        print(f"Panel error: {e}")
        return (f'Fehler: {e}', 500)


@app.route('/panel/send', methods=['POST'])
@require_auth
def panel_send():
    """Send panel message."""
    try:
        guild_id = session.get('selected_guild')
        cfg = read_config(guild_id)
        channel_id = request.form.get('channelId')

        cfg['panelChannelId'] = channel_id

        if not discord_client:
            return redirect(url_for('panel', msg='error'))

        guild = discord_client.get_guild(int(guild_id))
        channel = guild.get_channel(int(channel_id))

        # Build embed
        panel_embed = cfg.get('panelEmbed', {})
        embed = discord.Embed(
            title=panel_embed.get('title', ''),
            description=panel_embed.get('description', ''),
            color=int(panel_embed.get('color', '#5865F2').replace('#', ''), 16)
        )
        if panel_embed.get('footer'):
            embed.set_footer(text=panel_embed['footer'])

        # Build select menu
        topics = cfg.get('topics', [])
        if not topics:
            topics = [{'label': 'Keine Topics konfiguriert', 'value': 'none', 'emoji': '⚠️'}]

        view = discord.ui.View(timeout=None)
        options = [
            discord.SelectOption(label=t['label'], value=t['value'], emoji=t.get('emoji'))
            for t in topics
        ]
        select = discord.ui.Select(custom_id='topic', placeholder='Thema wählen …', options=options)
        view.add_item(select)

        # Send message (sync wrapper for async)
        async def send():
            msg = await channel.send(embed=embed, view=view)
            return msg.id

        message_id = run_async(send())
        cfg['panelMessageId'] = str(message_id)
        write_config(guild_id, cfg)

        return redirect(url_for('panel', msg='sent'))
    except Exception as e:
        print(f"Send error: {e}")
        return redirect(url_for('panel', msg='error'))


@app.route('/panel/edit', methods=['POST'])
@require_auth
def panel_edit():
    """Edit panel message."""
    try:
        guild_id = session.get('selected_guild')
        cfg = read_config(guild_id)

        if not cfg.get('panelChannelId') or not cfg.get('panelMessageId'):
            return redirect(url_for('panel', msg='nopanel'))

        guild = discord_client.get_guild(int(guild_id))
        channel = guild.get_channel(int(cfg['panelChannelId']))

        # Build embed
        panel_embed = cfg.get('panelEmbed', {})
        embed = discord.Embed(
            title=panel_embed.get('title', ''),
            description=panel_embed.get('description', ''),
            color=int(panel_embed.get('color', '#5865F2').replace('#', ''), 16)
        )
        if panel_embed.get('footer'):
            embed.set_footer(text=panel_embed['footer'])

        # Build select menu
        topics = cfg.get('topics', [])
        if not topics:
            topics = [{'label': 'Keine Topics konfiguriert', 'value': 'none', 'emoji': '⚠️'}]

        view = discord.ui.View(timeout=None)
        options = [
            discord.SelectOption(label=t['label'], value=t['value'], emoji=t.get('emoji'))
            for t in topics
        ]
        select = discord.ui.Select(custom_id='topic', placeholder='Thema wählen …', options=options)
        view.add_item(select)

        # Edit message
        async def edit():
            msg = await channel.fetch_message(int(cfg['panelMessageId']))
            await msg.edit(embed=embed, view=view)

        run_async(edit())

        return redirect(url_for('panel', msg='edited'))
    except Exception as e:
        print(f"Edit error: {e}")
        return redirect(url_for('panel', msg='error'))


@app.route('/tickets')
@require_auth
def tickets():
    """Tickets overview."""
    try:
        guild_id = session.get('selected_guild')
        tickets_data = load_tickets(guild_id)

        guild = discord_client.get_guild(int(guild_id))

        # Build member map
        member_map = {}
        user_ids = set()
        for t in tickets_data:
            if t.get('userId'):
                user_ids.add(t['userId'])
            if t.get('claimer'):
                user_ids.add(t['claimer'])

        for uid in user_ids:
            try:
                member = guild.get_member(int(uid))
                if member:
                    member_map[uid] = {
                        'tag': str(member),
                        'username': member.name,
                        'nickname': member.nick,
                        'display': member.display_name
                    }
                else:
                    member_map[uid] = {'tag': uid, 'username': uid, 'nickname': None, 'display': uid}
            except:
                member_map[uid] = {'tag': uid, 'username': uid, 'nickname': None, 'display': uid}

        return render_template('tickets.html',
                             tickets=json.dumps(tickets_data),
                             memberMap=json.dumps(member_map),
                             guildId=guild_id,
                             version=VERSION)
    except Exception as e:
        print(f"Tickets error: {e}")
        return ('Fehler beim Laden', 500)


@app.route('/tickets/data')
@require_auth
def tickets_data():
    """Tickets JSON data."""
    guild_id = session.get('selected_guild')
    return jsonify(load_tickets(guild_id))


@app.route('/transcript/<ticket_id>')
@require_auth
def transcript(ticket_id):
    """Serve transcript HTML."""
    ticket_id = ''.join(c for c in ticket_id if c.isdigit())
    if not ticket_id:
        return ('ID fehlt', 400)

    file_path = Path(__file__).parent / f"transcript_{ticket_id}.html"
    if not file_path.exists():
        return ('Transcript nicht gefunden', 404)

    return send_file(file_path)


@app.route('/webhook/github', methods=['POST'])
def github_webhook():
    """GitHub webhook endpoint."""
    try:
        payload = request.json
        event = request.headers.get('X-GitHub-Event')

        # Only process push events
        if event != 'push':
            return ('OK', 200)

        repository = payload.get('repository', {}).get('full_name', 'Unknown')
        commits = payload.get('commits', [])
        ref = payload.get('ref', '')
        branch = ref.replace('refs/heads/', '')

        # Only for TRS-Tickets-Bot
        if 'trs-tickets-bot' not in repository.lower():
            return ('OK', 200)

        # Send to all guilds with GitHub logs enabled
        if discord_client:
            async def send_commits():
                for guild in discord_client.guilds:
                    try:
                        cfg = read_config(str(guild.id))

                        if cfg.get('githubCommitsEnabled') == False or not cfg.get('githubWebhookChannelId'):
                            continue

                        channel = guild.get_channel(int(cfg['githubWebhookChannelId']))
                        if not channel:
                            continue

                        # Send max 5 commits
                        for commit in commits[:5]:
                            embed = discord.Embed(
                                title='📝 New Commit',
                                description=commit.get('message', 'No commit message'),
                                color=0x00ff88,
                                timestamp=datetime.fromisoformat(commit['timestamp'].replace('Z', '+00:00'))
                            )
                            embed.add_field(name='👤 Author', value=commit.get('author', {}).get('name', 'Unknown'), inline=True)
                            embed.add_field(name='🌿 Branch', value=branch, inline=True)
                            embed.add_field(name='📦 Repository', value=repository, inline=False)
                            embed.set_footer(text='TRS Tickets Bot Updates')

                            if commit.get('url'):
                                embed.url = commit['url']

                            await channel.send(embed=embed)

                        if len(commits) > 5:
                            await channel.send(f"_... und {len(commits) - 5} weitere Commit(s)_")
                    except Exception as e:
                        print(f"GitHub webhook error for guild {guild.id}: {e}")

            run_async(send_commits())

        return ('OK', 200)
    except Exception as e:
        print(f"GitHub webhook error: {e}")
        return ('Error', 500)


@app.route('/terms-of-service')
def terms_of_service():
    """Terms of service."""
    return render_template('terms_of_service.html', version=VERSION)


@app.route('/privacy-policy')
def privacy_policy():
    """Privacy policy."""
    return render_template('privacy_policy.html', version=VERSION)


@app.route('/imprint')
def imprint():
    """Imprint."""
    return render_template('imprint.html', version=VERSION)


# ==================== Run ====================

if __name__ == '__main__':
    print("⚠️ Starte panel_flask.py direkt mit main.py!")
    print("   python main.py")
