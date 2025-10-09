"""
Translation Module
Multi-language support for the bot
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional

# Base directory
BASE_DIR = Path(__file__).parent.parent
TRANSLATIONS_DIR = BASE_DIR / "translations"
CONFIG_DIR = BASE_DIR / "configs"

# Load translations
translations: Dict[str, Dict[str, Any]] = {}

for lang_code in ['de', 'en', 'he']:
    lang_file = TRANSLATIONS_DIR / f"{lang_code}.json"
    if lang_file.exists():
        with open(lang_file, 'r', encoding='utf-8') as f:
            translations[lang_code] = json.load(f)


def get_guild_language(guild_id: Optional[str]) -> str:
    """
    Get guild's language from config.

    Args:
        guild_id: Discord guild ID

    Returns:
        Language code (de, en, or he)
    """
    try:
        if not guild_id:
            return 'de'  # Default to German

        config_path = CONFIG_DIR / f"{guild_id}.json"

        if not config_path.exists():
            return 'de'

        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
            return config.get('language', 'de')
    except Exception as e:
        print(f"Error getting guild language: {e}")
        return 'de'


def set_guild_language(guild_id: str, lang: str) -> bool:
    """
    Set guild's language in config.

    Args:
        guild_id: Discord guild ID
        lang: Language code (de, en, or he)

    Returns:
        True if successful, False otherwise
    """
    try:
        if not guild_id:
            return False

        # Validate language
        if lang not in ['de', 'en', 'he']:
            lang = 'de'

        config_path = CONFIG_DIR / f"{guild_id}.json"
        config = {}

        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)

        config['language'] = lang

        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

        return True
    except Exception as e:
        print(f"Error setting guild language: {e}")
        return False


def t(guild_id: Optional[str], key: str, replacements: Optional[Dict[str, str]] = None) -> str:
    """
    Get translated text for a guild.

    Args:
        guild_id: Discord guild ID
        key: Translation key (e.g., 'ticket.created')
        replacements: Dictionary with placeholder replacements

    Returns:
        Translated text
    """
    if replacements is None:
        replacements = {}

    lang = get_guild_language(guild_id)
    keys = key.split('.')
    value = translations.get(lang, translations.get('de', {}))

    for k in keys:
        if isinstance(value, dict):
            value = value.get(k)
        else:
            return key  # Return key if translation not found

    if not isinstance(value, str):
        return key

    # Replace placeholders
    result = value
    for placeholder, replacement in replacements.items():
        result = result.replace(f'{{{placeholder}}}', str(replacement))

    return result


def get_translations(lang: str = 'de') -> Dict[str, Any]:
    """
    Get all translations for a language.

    Args:
        lang: Language code

    Returns:
        Translation dictionary
    """
    return translations.get(lang, translations.get('de', {}))


def get_language_name(lang: str) -> str:
    """
    Get language name.

    Args:
        lang: Language code

    Returns:
        Language name
    """
    names = {
        'de': 'Deutsch',
        'en': 'English',
        'he': 'עברית'
    }
    return names.get(lang, 'Deutsch')
