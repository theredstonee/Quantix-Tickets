"""
TRS Tickets - Flask Web Panel
Multi-server admin dashboard with Discord OAuth
"""

import os
import re
import json
import asyncio
from pathlib import Path
from datetime import datetime
from functools import wraps

import discord
from flask import Flask, render_template, request, redirect, session, url_for, jsonify, send_file
from requests_oauthlib import OAuth2Session
from dotenv import load_dotenv

import config
from utils.translations import get_translations, t, get_language_name

# Load environment
load_dotenv()

# Flask setup
app = Flask(__name__)
app.secret_key = os.getenv('SESSION_SECRET', 'ticketbotsecret')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

if os.getenv('PUBLIC_BASE_URL', '').startswith('https://'):
    app.config['SESSION_COOKIE_SECURE'] = True

# Discord OAuth Config
CLIENT_ID = os.getenv('CLIENT_ID')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
BASE_URL = os.getenv('PUBLIC_BASE_URL', 'http://localhost:3000')
REDIRECT_URI = f"{BASE_URL.rstrip('/')}/auth/discord/callback"

OAUTH_SCOPE = ['identify', 'guilds', 'guilds.members.read']
DISCORD_API_BASE = 'https://discord.com/api/v10'
AUTHORIZATION_BASE_URL = f'{DISCORD_API_BASE}/oauth2/authorize'
TOKEN_URL = f'{DISCORD_API_BASE}/oauth2/token'

VERSION = 'Beta 0.3.0'

# Bot client (will be set by main script)
bot_client = None


def set_bot_client(client):
    """Set Discord bot client instance."""
    global bot_client
    bot_client = client


# ==================== Decorators ====================

def login_required(f):
    """Require user to be logged in."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'oauth_token' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def guild_selected_required(f):
    """Require a guild to be selected."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'selected_guild' not in session:
            return redirect(url_for('select_server'))
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Require user to have admin permissions."""
    @wraps(f)
    @login_required
    @guild_selected_required
    def decorated_function(*args, **kwargs):
        guild_id = session.get('selected_guild')
        user_guilds = session.get('guilds', [])

        guild = next((g for g in user_guilds if g['id'] == guild_id), None)

        if not guild:
            return "Du bist nicht auf diesem Server oder der Bot ist nicht auf dem Server.", 403

        # Check admin permission (0x8)
        permissions = int(guild.get('permissions', 0))
        if not (permissions & 0x8):
            return "Keine Berechtigung. Du brauchst Administrator-Rechte auf diesem Server.", 403

        return f(*args, **kwargs)
    return decorated_function


# ==================== Helper Functions ====================

def get_discord_session(token=None):
    """Get Discord OAuth session."""
    return OAuth2Session(
        CLIENT_ID,
        token=token or session.get('oauth_token'),
        scope=OAUTH_SCOPE
    )


async def log_event(guild_id: str, text: str, user: dict = None):
    """Log event to configured channel."""
    if not bot_client:
        return

    try:
        cfg = config.read_config(guild_id)
        log_channel_id = cfg.get('logChannelId')

        if not log_channel_id:
            return

        guild = await bot_client.fetch_guild(int(guild_id))
        channel = await guild.fetch_channel(int(log_channel_id))

        if not channel:
            return

        embed = discord.Embed(
            description=text,
            color=0x00ff00,
            timestamp=datetime.now()
        )
        embed.set_footer(text='TRS Tickets ©️')

        if user:
            avatar_url = None
            if user.get('avatar'):
                avatar_url = f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.png"

            embed.set_author(
                name=user.get('username', 'User'),
                icon_url=avatar_url
            )

        await channel.send(embed=embed)
    except Exception as e:
        print(f"Log error: {e}")


def run_async(coro):
    """Run async function in sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(coro)


# ==================== Routes ====================

@app.route('/')
def home():
    """Home page."""
    lang = request.cookies.get('lang', 'de')
    user = None
    is_authenticated = 'oauth_token' in session

    if is_authenticated:
        user = session.get('user')

    return render_template(
        'home.html',
        lang=lang,
        t=get_translations(lang),
        user=user,
        isAuthenticated=is_authenticated
    )


@app.route('/login')
def login():
    """Initiate Discord OAuth login."""
    if 'oauth_token' in session:
        return redirect(url_for('select_server'))

    # Rate limit check
    last_attempt = session.get('last_login_attempt', 0)
    now = datetime.now().timestamp() * 1000

    if now - last_attempt < 4000:
        return 'Zu viele Login-Versuche – bitte 4s warten. <a href="/">Zurück</a>', 429

    session['last_login_attempt'] = now

    # Create OAuth session
    discord = OAuth2Session(CLIENT_ID, scope=OAUTH_SCOPE, redirect_uri=REDIRECT_URI)
    authorization_url, state = discord.authorization_url(AUTHORIZATION_BASE_URL)

    session['oauth_state'] = state
    return redirect(authorization_url)


@app.route('/auth/discord/callback')
def callback():
    """Discord OAuth callback."""
    if 'oauth_state' not in session:
        return redirect(url_for('login'))

    # Exchange code for token
    discord = OAuth2Session(
        CLIENT_ID,
        state=session['oauth_state'],
        redirect_uri=REDIRECT_URI
    )

    try:
        token = discord.fetch_token(
            TOKEN_URL,
            client_secret=CLIENT_SECRET,
            authorization_response=request.url
        )
    except Exception as e:
        print(f"OAuth error: {e}")
        return 'OAuth Fehler. <a href="/login">Zurück</a>', 500

    session['oauth_token'] = token

    # Fetch user info
    try:
        user_response = discord.get(f'{DISCORD_API_BASE}/users/@me')
        user = user_response.json()
        session['user'] = user

        # Fetch guilds
        guilds_response = discord.get(f'{DISCORD_API_BASE}/users/@me/guilds')
        guilds = guilds_response.json()
        session['guilds'] = guilds
    except Exception as e:
        print(f"Error fetching user data: {e}")
        return 'Fehler beim Abrufen der Benutzerdaten.', 500

    return redirect(url_for('select_server'))


@app.route('/logout')
def logout():
    """Logout user."""
    session.clear()
    return redirect(url_for('home'))


@app.route('/select-server', methods=['GET', 'POST'])
@login_required
def select_server():
    """Guild selection page."""
    if request.method == 'POST':
        guild_id = request.form.get('guildId')

        if not guild_id:
            return redirect(url_for('select_server'))

        # Verify user has admin permissions
        user_guilds = session.get('guilds', [])
        guild = next((g for g in user_guilds if g['id'] == guild_id), None)

        if not guild:
            return 'Server nicht gefunden.', 403

        permissions = int(guild.get('permissions', 0))
        if not (permissions & 0x8):  # Admin permission
            return 'Keine Administrator-Rechte auf diesem Server.', 403

        session['selected_guild'] = guild_id
        return redirect(url_for('panel'))

    # GET: Show server list
    if not bot_client:
        return 'Bot ist nicht bereit.', 500

    # Get bot guilds
    bot_guild_ids = {str(g.id) for g in bot_client.guilds}

    # Filter user guilds
    user_guilds = session.get('guilds', [])
    available_servers = []

    for guild in user_guilds:
        # Check if bot is in guild and user is admin
        permissions = int(guild.get('permissions', 0))
        is_admin = bool(permissions & 0x8)
        has_bot = guild['id'] in bot_guild_ids

        if has_bot and is_admin:
            available_servers.append({
                'id': guild['id'],
                'name': guild['name'],
                'icon': f"https://cdn.discordapp.com/icons/{guild['id']}/{guild['icon']}.png" if guild.get('icon') else None
            })

    if not available_servers:
        return '''
            <h1>Keine Server verfügbar</h1>
            <p>Du bist auf keinem Server Administrator wo der Bot ist.</p>
            <p><a href="/logout">Logout</a></p>
        '''

    lang = request.cookies.get('lang', 'de')
    return render_template(
        'select-server.html',
        servers=available_servers,
        version=VERSION,
        currentGuild=session.get('selected_guild'),
        t=get_translations(lang)
    )


@app.route('/panel', methods=['GET', 'POST'])
@admin_required
def panel():
    """Main admin panel."""
    guild_id = session['selected_guild']
    cfg = config.read_config(guild_id)

    if request.method == 'POST':
        # Save configuration
        try:
            cfg['guildId'] = guild_id

            # Server settings
            if 'ticketCategoryId' in request.form:
                cfg['ticketCategoryId'] = request.form['ticketCategoryId'].strip()

            if 'logChannelId' in request.form:
                cfg['logChannelId'] = request.form['logChannelId'].strip()

            if 'transcriptChannelId' in request.form:
                cfg['transcriptChannelId'] = request.form['transcriptChannelId'].strip()

            if 'teamRoleId' in request.form:
                cfg['teamRoleId'] = request.form['teamRoleId'].strip()

            # Topics (table values have priority)
            labels = request.form.getlist('label')
            values = request.form.getlist('value')
            emojis = request.form.getlist('emoji')

            table_topics = []
            for i in range(len(labels)):
                label = labels[i].strip() if i < len(labels) else ''
                if not label:
                    continue

                value = values[i].strip() if i < len(values) and values[i].strip() else label.lower().replace(' ', '-')
                emoji = emojis[i].strip() if i < len(emojis) else ''

                topic = {'label': label, 'value': value}
                if emoji:
                    topic['emoji'] = emoji

                table_topics.append(topic)

            if table_topics:
                cfg['topics'] = table_topics
            else:
                # Try JSON fallback
                topics_json = request.form.get('topicsJson', '').strip()
                if topics_json:
                    try:
                        parsed = json.loads(topics_json)
                        if isinstance(parsed, list):
                            cfg['topics'] = parsed
                    except:
                        pass

                if not isinstance(cfg.get('topics'), list):
                    cfg['topics'] = []

            # Form fields (JSON)
            if 'formFieldsJson' in request.form:
                try:
                    ff = json.loads(request.form['formFieldsJson'])
                    cfg['formFields'] = ff if isinstance(ff, list) else []
                except:
                    cfg['formFields'] = []

            # Embeds
            def ensure_hex(value, fallback='#2b90d9'):
                """Ensure color is valid hex."""
                val = str(value or '').strip()
                if re.match(r'^#?[0-9a-fA-F]{6}$', val):
                    return val if val.startswith('#') else f'#{val}'
                return fallback

            # Ticket Embed
            prev_te = cfg.get('ticketEmbed', {})
            cfg['ticketEmbed'] = {
                'title': request.form.get('embedTitle', prev_te.get('title', '')),
                'description': request.form.get('embedDescription', prev_te.get('description', '')),
                'color': ensure_hex(request.form.get('embedColor', prev_te.get('color', '#2b90d9'))),
                'footer': request.form.get('embedFooter', prev_te.get('footer', ''))
            }

            # Panel Embed
            prev_pe = cfg.get('panelEmbed', {})
            cfg['panelEmbed'] = {
                'title': request.form.get('panelTitle', prev_pe.get('title', '')),
                'description': request.form.get('panelDescription', prev_pe.get('description', '')),
                'color': ensure_hex(request.form.get('panelColor', prev_pe.get('color', '#5865F2'))),
                'footer': request.form.get('panelFooter', prev_pe.get('footer', ''))
            }

            config.write_config(guild_id, cfg)

            # Log event
            user = session.get('user')
            if bot_client:
                run_async(log_event(guild_id, t(guild_id, 'logs.config_updated'), user))

            return redirect(url_for('panel', msg='saved'))
        except Exception as e:
            print(f"Panel save error: {e}")
            return redirect(url_for('panel', msg='error'))

    # GET: Show panel
    if not bot_client:
        return 'Bot ist nicht bereit.', 500

    try:
        guild = bot_client.get_guild(int(guild_id))
        if not guild:
            guild = run_async(bot_client.fetch_guild(int(guild_id)))

        guild_name = guild.name

        # Fetch channels
        channels = []
        for channel in guild.channels:
            if channel.type in [discord.ChannelType.text, discord.ChannelType.category]:
                channels.append({
                    'id': str(channel.id),
                    'name': channel.name,
                    'type': channel.type.value
                })

        channels.sort(key=lambda x: x['name'])

        # Fetch roles
        roles = []
        for role in guild.roles:
            if role.id != guild.id:  # Exclude @everyone
                roles.append({
                    'id': str(role.id),
                    'name': role.name,
                    'color': str(role.color)
                })

        roles.sort(key=lambda x: x['name'])

    except Exception as e:
        print(f"Error fetching guild data: {e}")
        channels = []
        roles = []
        guild_name = 'Server'

    return render_template(
        'panel.html',
        cfg=cfg,
        msg=request.args.get('msg'),
        channels=channels,
        roles=roles,
        version=VERSION,
        guildName=guild_name,
        guildId=guild_id
    )


@app.route('/panel/send', methods=['POST'])
@admin_required
def panel_send():
    """Send panel message."""
    guild_id = session['selected_guild']
    cfg = config.read_config(guild_id)

    channel_id = request.form.get('channelId')
    cfg['panelChannelId'] = channel_id

    try:
        if not bot_client:
            return redirect(url_for('panel', msg='error'))

        guild = bot_client.get_guild(int(guild_id))
        if not guild:
            guild = run_async(bot_client.fetch_guild(int(guild_id)))

        channel = run_async(guild.fetch_channel(int(channel_id)))

        # Build embed
        panel_embed = None
        if cfg.get('panelEmbed') and (cfg['panelEmbed'].get('title') or cfg['panelEmbed'].get('description')):
            panel_embed = discord.Embed()

            if cfg['panelEmbed'].get('title'):
                panel_embed.title = cfg['panelEmbed']['title']

            if cfg['panelEmbed'].get('description'):
                panel_embed.description = cfg['panelEmbed']['description']

            color = cfg['panelEmbed'].get('color', '#5865F2')
            if isinstance(color, str) and color.startswith('#'):
                try:
                    panel_embed.color = int(color[1:], 16)
                except:
                    panel_embed.color = 0x5865F2

            if cfg['panelEmbed'].get('footer'):
                panel_embed.set_footer(text=cfg['panelEmbed']['footer'])

        # Build select menu
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
            placeholder='Thema wählen …',
            options=options
        )

        view = discord.ui.View(timeout=None)
        view.add_item(select)

        # Send message
        sent_message = run_async(channel.send(
            embed=panel_embed if panel_embed else None,
            view=view
        ))

        cfg['panelMessageId'] = str(sent_message.id)
        config.write_config(guild_id, cfg)

        # Log event
        user = session.get('user')
        if bot_client:
            run_async(log_event(
                guild_id,
                t(guild_id, 'logs.panel_sent', {'channel': f'<#{channel_id}>'}),
                user
            ))

        return redirect(url_for('panel', msg='sent'))
    except Exception as e:
        print(f"Panel send error: {e}")
        return redirect(url_for('panel', msg='error'))


@app.route('/panel/edit', methods=['POST'])
@admin_required
def panel_edit():
    """Edit panel message."""
    guild_id = session['selected_guild']
    cfg = config.read_config(guild_id)

    if not cfg.get('panelChannelId') or not cfg.get('panelMessageId'):
        return redirect(url_for('panel', msg='nopanel'))

    try:
        if not bot_client:
            return redirect(url_for('panel', msg='error'))

        guild = bot_client.get_guild(int(guild_id))
        if not guild:
            guild = run_async(bot_client.fetch_guild(int(guild_id)))

        channel = run_async(guild.fetch_channel(int(cfg['panelChannelId'])))
        message = run_async(channel.fetch_message(int(cfg['panelMessageId'])))

        # Build embed
        panel_embed = None
        if cfg.get('panelEmbed') and (cfg['panelEmbed'].get('title') or cfg['panelEmbed'].get('description')):
            panel_embed = discord.Embed()

            if cfg['panelEmbed'].get('title'):
                panel_embed.title = cfg['panelEmbed']['title']

            if cfg['panelEmbed'].get('description'):
                panel_embed.description = cfg['panelEmbed']['description']

            color = cfg['panelEmbed'].get('color', '#5865F2')
            if isinstance(color, str) and color.startswith('#'):
                try:
                    panel_embed.color = int(color[1:], 16)
                except:
                    panel_embed.color = 0x5865F2

            if cfg['panelEmbed'].get('footer'):
                panel_embed.set_footer(text=cfg['panelEmbed']['footer'])

        # Build select menu
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
            placeholder='Thema wählen …',
            options=options
        )

        view = discord.ui.View(timeout=None)
        view.add_item(select)

        # Edit message
        run_async(message.edit(
            embed=panel_embed if panel_embed else None,
            view=view
        ))

        # Log event
        user = session.get('user')
        if bot_client:
            run_async(log_event(
                guild_id,
                t(guild_id, 'logs.panel_edited', {'channel': f"<#{cfg['panelChannelId']}>"}),
                user
            ))

        return redirect(url_for('panel', msg='edited'))
    except Exception as e:
        print(f"Panel edit error: {e}")
        return redirect(url_for('panel', msg='error'))


@app.route('/tickets')
@admin_required
def tickets():
    """Tickets overview page."""
    guild_id = session['selected_guild']
    tickets_data = config.load_tickets(guild_id)

    if not bot_client:
        return 'Bot ist nicht bereit.', 500

    # Build member map
    member_map = {}
    user_ids = set()

    for ticket in tickets_data:
        if ticket.get('userId'):
            user_ids.add(ticket['userId'])
        if ticket.get('claimer'):
            user_ids.add(ticket['claimer'])

    try:
        guild = bot_client.get_guild(int(guild_id))
        if not guild:
            guild = run_async(bot_client.fetch_guild(int(guild_id)))

        for user_id in user_ids:
            try:
                member = run_async(guild.fetch_member(int(user_id)))
                member_map[user_id] = {
                    'tag': str(member),
                    'username': member.name,
                    'nickname': member.nick,
                    'display': member.display_name
                }
            except:
                member_map[user_id] = {
                    'tag': user_id,
                    'username': user_id,
                    'nickname': None,
                    'display': user_id
                }
    except Exception as e:
        print(f"Error building member map: {e}")

    return render_template(
        'tickets.html',
        tickets=json.dumps(tickets_data),
        memberMap=json.dumps(member_map),
        guildId=guild_id,
        version=VERSION
    )


@app.route('/tickets/data')
@admin_required
def tickets_data():
    """Get tickets as JSON."""
    guild_id = session['selected_guild']
    tickets = config.load_tickets(guild_id)
    return jsonify(tickets)


@app.route('/transcript/<ticket_id>')
@admin_required
def transcript(ticket_id):
    """View transcript."""
    # Sanitize ticket ID
    ticket_id = re.sub(r'[^0-9]', '', ticket_id)

    if not ticket_id:
        return 'ID fehlt', 400

    transcript_file = config.BASE_DIR / f"transcript_{ticket_id}.html"

    if not transcript_file.exists():
        return 'Transcript nicht gefunden', 404

    return send_file(transcript_file)


@app.route('/set-user-language/<lang>')
def set_user_language(lang):
    """Set user language preference (cookie)."""
    if lang not in ['de', 'en', 'he']:
        lang = 'de'

    response = redirect(url_for('home'))
    response.set_cookie('lang', lang, max_age=365*24*60*60)  # 1 year

    return response


@app.route('/set-language/<lang>')
@admin_required
def set_language(lang):
    """Set guild language."""
    if lang not in ['de', 'en', 'he']:
        lang = 'de'

    guild_id = session['selected_guild']
    cfg = config.read_config(guild_id)
    cfg['language'] = lang
    config.write_config(guild_id, cfg)

    # Log event
    lang_name = get_language_name(lang)
    user = session.get('user')

    if bot_client:
        run_async(log_event(
            guild_id,
            t(guild_id, 'logs.language_changed', {'language': lang_name}),
            user
        ))

    referer = request.headers.get('Referer', url_for('panel'))
    return redirect(referer)


@app.route('/terms-of-service')
def terms_of_service():
    """Terms of Service page."""
    lang = request.cookies.get('lang', 'de')
    return render_template(
        'terms-of-service.html',
        t=get_translations(lang),
        lang=lang
    )


@app.route('/privacy-policy')
def privacy_policy():
    """Privacy Policy page."""
    lang = request.cookies.get('lang', 'de')
    return render_template(
        'privacy-policy.html',
        t=get_translations(lang),
        lang=lang
    )


@app.route('/imprint')
def imprint():
    """Imprint page."""
    lang = request.cookies.get('lang', 'de')
    return render_template(
        'imprint.html',
        t=get_translations(lang),
        lang=lang
    )


# ==================== Run ====================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=True)
