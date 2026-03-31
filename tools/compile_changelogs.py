#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import yaml
import os
import sys
import glob
import json
import shutil
from datetime import date

CHANGELOG_TYPE_MAPPING = {
    'bugfix': 'bugfix', 'fix': 'bugfix',
    'wip': 'wip', 'qol': 'qol',
    'soundadd': 'sound', 'sounddel': 'sound',
    'rscadd': 'rscadd', 'add': 'rscadd',
    'rscdel': 'rscdel', 'del': 'rscdel',
    'imageadd': 'image', 'imagedel': 'image',
    'spellcheck': 'spellcheck', 'experiment': 'experiment',
    'balance': 'balance', 'code_imp': 'code_imp',
    'refactor': 'refactor', 'config': 'server',
    'admin': 'admin', 'server': 'server',
    'sound': 'sound', 'image': 'image',
    'map': 'map', 'ship': 'ship',
    'tweak': 'tweak', 'performance': 'performance',
    'localization': 'localization'
}

today = date.today()
month_key = today.strftime("%Y-%m")

def load_existing_json(archive_dir):
    """Загружает существующий JSON файл для текущего месяца."""
    json_file = os.path.join(archive_dir, month_key + '.json')
    if os.path.exists(json_file):
        with open(json_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_json(archive_dir, data):
    """Сохраняет JSON файл для текущего месяца."""
    os.makedirs(archive_dir, exist_ok=True)
    json_file = os.path.join(archive_dir, month_key + '.json')
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def parse_changelog_file(filepath):
    """Читает YAML-файл и возвращает список записей."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Удаляем комментарий # PR: ...
    if content.startswith('# PR:'):
        lines = content.split('\n')
        yaml_content = '\n'.join(lines[1:])
    else:
        yaml_content = content
    
    data = yaml.safe_load(yaml_content)
    if not data:
        return []
    
    records = []
    today_str = today.isoformat()
    
    for source, source_data in data.items():
        if source in ('delete-after', '_COMMENT'):
            continue
        if not isinstance(source_data, dict):
            continue
        
        for pr_number, pr_data in source_data.items():
            title = pr_data.get('title', '')
            changes_by_author = pr_data.get('changes', {})
            
            for author, changes in changes_by_author.items():
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
                
                records.append({
                    'date': today_str,
                    'source': source,
                    'pr': str(pr_number),
                    'title': title,
                    'author': author,
                    'changes': parsed_changes,
                })
    
    return records

def get_record_key(record):
    """Уникальный ключ записи для проверки дубликатов."""
    return f"{record['source']}|{record['pr']}|{record['author']}|{record['title']}"

def main():
    if len(sys.argv) != 2:
        print("Usage: python compile_changelogs.py <changelogs_dir>")
        sys.exit(1)
    
    changelogs_dir = sys.argv[1]
    archive_dir = os.path.join(changelogs_dir, 'archive')
    processed_dir = os.path.join(changelogs_dir, 'processed')
    
    # Загружаем существующие записи
    existing_records = load_existing_json(archive_dir)
    existing_keys = {get_record_key(r) for r in existing_records}
    
    # Собираем новые записи
    new_records = []
    
    for filepath in glob.glob(os.path.join(changelogs_dir, "*.yml")):
        filename = os.path.basename(filepath)
        if filename.startswith('.') or filename == 'example.yml':
            continue
        
        print(f"Reading {filename}...")
        records = parse_changelog_file(filepath)
        
        if records:
            for record in records:
                key = get_record_key(record)
                if key not in existing_keys:
                    new_records.append(record)
                    existing_keys.add(key)
                    print(f"  New: {record['source']} #{record['pr']} by {record['author']}")
                else:
                    print(f"  Skip duplicate: {record['source']} #{record['pr']} by {record['author']}")
        
        # Перемещаем обработанный файл
        os.makedirs(processed_dir, exist_ok=True)
        shutil.move(filepath, os.path.join(processed_dir, filename))
    
    # Если есть новые записи - сохраняем
    if new_records:
        all_records = existing_records + new_records
        save_json(archive_dir, all_records)
        print(f"\nSaved {len(new_records)} new records to {month_key}.json (total: {len(all_records)})")
    else:
        print("\nNo new records to add")
    
    # Обновляем список месяцев
    months = []
    for json_file in sorted(glob.glob(os.path.join(archive_dir, "*.json")), reverse=True):
        month = os.path.splitext(os.path.basename(json_file))[0]
        months.append(month)
    
    months_json_path = os.path.join(changelogs_dir, 'months.json')
    with open(months_json_path, 'w', encoding='utf-8') as f:
        json.dump(months, f, ensure_ascii=False)
    print(f"Updated {months_json_path}")

if __name__ == "__main__":
    main()