#!/usr/bin/env python3
import re

files = [
    'commands/lifetime-premium.js',
    'commands/premium-role.js',
    'commands/betatester.js'
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove lines with he: or ar: locale codes (including the comma from previous line if needed)
    # Pattern: remove lines that are just whitespace + (he|ar): + anything + optional comma
    lines = content.split('\n')
    filtered_lines = []

    for i, line in enumerate(lines):
        # Skip lines that contain 'he:' or 'ar:' as locale keys
        if re.match(r'\s+(he|ar):\s+[\'"]', line):
            # Also remove trailing comma from previous line if it exists
            if filtered_lines and filtered_lines[-1].rstrip().endswith(','):
                # Check if next line doesn't start with a locale key (meaning this was the last locale)
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    if next_line.startswith('}'):
                        # Remove comma from last line
                        filtered_lines[-1] = filtered_lines[-1].rstrip().rstrip(',') + '\n' if filtered_lines[-1].endswith('\n') else filtered_lines[-1].rstrip().rstrip(',')
            continue
        filtered_lines.append(line)

    cleaned_content = '\n'.join(filtered_lines)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(cleaned_content)

    print(f'✅ Cleaned {filepath}')

print('✅ All files cleaned successfully!')
