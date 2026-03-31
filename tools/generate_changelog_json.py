#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import yaml
import os
import sys
import glob
import json
from datetime import datetime
from collections import defaultdict

# Маппинг типов изменений на CSS классы
CHANGELOG_TYPE_MAPPING = {
    'bugfix': 'bugfix', 'fix': 'bugfix'
    'tweak': 'tweak', 'qol': 'tweak',
    'soundadd': 'sound', 'sounddel': 'sound',
    'rscadd': 'rscadd', 'add': 'rscadd',
    'rscdel': 'rscdel', 'del': 'rscdel',
    'imageadd': 'image', 'imagedel': 'image',
    'spellcheck': 'spellcheck', 'balance': 'balance',
    'code_imp': 'code_imp', 'refactor': 'code_imp',
    'config': 'server', 'server': 'server,
    'sound': 'sound', 'image': 'image',
    'map': 'map', 'ship': 'ship'
    'admin': 'admin'
}

def get_years_to_show():
    return [datetime.now().year]

def load_changelog_entries(archive_dir):
    """Загружает changelog записи из архива."""
    entries = {}
    years = get_years_to_show()
    print(f"Loading changelogs for years: {years}")

    for month_file in sorted(glob.glob(os.path.join(archive_dir, "*.yml")), reverse=True):
        filename = os.path.basename(month_file)
        try:
            year = int(filename.split('-')[0])
        except:
            continue
            
        if year not in years:
            print(f"Skipping {filename} (year {year})")
            continue
            
        print(f"Loading {filename}")
        with open(month_file, 'r', encoding='utf-8') as f:
            try:
                month_data = yaml.safe_load(f)
                if month_data:
                    # Структура: { date_str: { source: { pr_number: { title, changes } } } }
                    for date_key, date_entries in month_data.items():
                        try:
                            date_year = datetime.strptime(date_key, "%Y-%m-%d").year
                            if date_year in years:
                                if date_key not in entries:
                                    entries[date_key] = {}
                                    
                                for source, source_data in date_entries.items():
                                    if source not in entries[date_key]:
                                        entries[date_key][source] = {}
                                    entries[date_key][source].update(source_data)
                        except (ValueError, TypeError):
                            print(f"Warning: Cannot parse date {date_key}")
                            continue
            except yaml.YAMLError as e:
                print(f"Error parsing {month_file}: {e}", file=sys.stderr)
                continue

    total_prs = sum(len(source_data) for date_data in entries.values() 
                    for source_data in date_data.values())
    print(f"Loaded {total_prs} PRs from {len(entries)} dates")
    return entries

def format_date(date_obj):
    return date_obj.strftime("%d.%m.%Y")

def build_pr_link(pr_number):
    """Построить ссылку на PR."""
    parts = str(pr_number).split('/')
    if len(parts) >= 3:
        pr_id = parts[-1]
        owner, repo = parts[0], parts[1]
        return f"https://github.com/{owner}/{repo}/pull/{pr_id}"
    else:
        return f"https://github.com/horizon-dev-team/HORIZON-Project-Prototype/pull/{pr_number}"

def generate_changelog_json(entries):
    result = []
    sorted_dates = sorted(entries.keys(), reverse=True)

    for date_key in sorted_dates:
        for source in sorted(entries[date_key].keys()):
            source_data = entries[date_key][source]
            sorted_prs = sorted(source_data.keys(), key=lambda x: int(str(x).split('/')[-1]))

            for pr_number in sorted_prs:
                pr_data = source_data[pr_number]
                title = pr_data.get('title', '')
                for author in sorted(pr_data.get('changes', {}).keys()):
                    changes = pr_data['changes'][author]
                    parsed_changes = []

                    for change in changes:
                        if isinstance(change, dict):
                            change_type, description = list(change.items())[0]
                        else:
                            parts = str(change).split(': ', 1)
                            if len(parts) == 2:
                                change_type, description = parts
                            else:
                                change_type = 'tweak'
                                description = str(change)

                        css_class = CHANGELOG_TYPE_MAPPING.get(change_type.lower(), 'tweak')
                        parsed_changes.append({
                            'type': change_type,
                            'class': css_class,
                            'text': description,
                        })

                    result.append({
                        'date': date_key,
                        'source': source,
                        'pr': str(pr_number),
                        'title': title,
                        'author': author,
                        'changes': parsed_changes,
                    })

    return result


def main():
    if len(sys.argv) not in (2, 4):
        print("Usage: python generate_changelog_json.py <changelogs_dir> [--output <output_json>]")
        sys.exit(1)

    changelogs_dir = sys.argv[1]
    json_output = None

    if len(sys.argv) == 4:
        if sys.argv[2] == '--output':
            json_output = sys.argv[3]
        else:
            print("Unknown option", sys.argv[2])
            sys.exit(1)

    archive_dir = os.path.join(changelogs_dir, 'archive')
    if not os.path.exists(archive_dir):
        print(f"Error: Archive directory not found: {archive_dir}", file=sys.stderr)
        sys.exit(1)

    # Загружаем записи
    entries = load_changelog_entries(archive_dir)

    if not entries:
        print("No entries found")
        sys.exit(0)

    # Генерируем JSON
    if json_output is None:
        json_output = os.path.join(changelogs_dir, '..', 'static', 'changelogs.json')

    changelog_json = generate_changelog_json(entries)
    
    os.makedirs(os.path.dirname(json_output), exist_ok=True)
    with open(json_output, 'w', encoding='utf-8') as f:
        json.dump(changelog_json, f, ensure_ascii=False, indent=2)
    
    print(f"Successfully generated JSON: {json_output}")
    print(f"Total entries: {len(changelog_json)}")


if __name__ == "__main__":
    main()