#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import yaml
import os
import sys
import glob
import json
import shutil
from datetime import date, datetime
from collections import defaultdict

# Маппинг типов изменений на CSS классы (используется для генерации JSON)
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

def parse_changelog_file(filepath):
    """Читает YAML-файл и возвращает список записей (каждая соответствует одному PR+автору)."""
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
    today_str = date.today().isoformat()

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

def main():
    if len(sys.argv) != 2:
        print("Usage: python compile_changelogs.py <changelogs_dir>")
        sys.exit(1)

    changelogs_dir = sys.argv[1]
    yml_dir = changelogs_dir
    archive_dir = os.path.join(changelogs_dir, 'archive')
    processed_dir = os.path.join(changelogs_dir, 'processed')

    # Создаём папки, если их нет
    os.makedirs(archive_dir, exist_ok=True)
    os.makedirs(processed_dir, exist_ok=True)

    # Словарь: month_key -> list of records
    months_data = defaultdict(list)

    # Обрабатываем все YAML-файлы в корне changelogs
    for filepath in glob.glob(os.path.join(yml_dir, "*.yml")):
        filename = os.path.basename(filepath)
        if filename.startswith('.') or filename == 'example.yml':
            continue
        print(f"Processing {filename}...")
        try:
            records = parse_changelog_file(filepath)
            if records:
                # Группируем записи по месяцу (из поля date)
                for rec in records:
                    # Извлекаем YYYY-MM из даты
                    month_key = rec['date'][:7]  # "2026-03-22" -> "2026-03"
                    months_data[month_key].append(rec)
                # Перемещаем файл в processed
                dest = os.path.join(processed_dir, filename)
                shutil.move(filepath, dest)
                print(f"  Moved to {dest}")
            else:
                print(f"  No records found, moving to processed")
                shutil.move(filepath, os.path.join(processed_dir, filename))
        except Exception as e:
            print(f"  Error processing {filename}: {e}")
            # Оставляем файл на месте, чтобы не потерять
            continue

    # Сохраняем JSON для каждого месяца
    months_list = []
    for month_key, records in months_data.items():
        json_path = os.path.join(archive_dir, f"{month_key}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        print(f"Generated {json_path} ({len(records)} entries)")
        months_list.append(month_key)

    # Сортируем месяцы от новых к старым
    months_list.sort(reverse=True)

    # Сохраняем список месяцев
    months_json_path = os.path.join(changelogs_dir, 'months.json')
    with open(months_json_path, 'w', encoding='utf-8') as f:
        json.dump(months_list, f, ensure_ascii=False)
    print(f"Generated {months_json_path}")

if __name__ == "__main__":
    main()