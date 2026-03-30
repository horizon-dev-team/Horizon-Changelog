#!/usr/bin/env python3
'''
Usage:
    $ python ss13_genchangelog.py changelogs/
'''

import yaml
import os
import glob
import sys
import argparse
from datetime import date

today = date.today()
fileDateFormat = "%Y-%m"

def load_existing_archive(archive_dir, month):
    month_file = os.path.join(archive_dir, month + '.yml')
    if os.path.exists(month_file):
        with open(month_file, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    return {}

def save_archive(archive_dir, month, data):
    if not os.path.exists(archive_dir):
        os.makedirs(archive_dir)
    month_file = os.path.join(archive_dir, month + '.yml')
    with open(month_file, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)

def process_changelog_file(data, today_str, archive_data):
    """Обрабатывает файл в формате от autoChangelog.js"""
    # Удаляем комментарий PR, если есть
    if '_COMMENT' in data:
        del data['_COMMENT']
    
    # Удаляем delete-after из данных для архива
    delete_after = data.pop('delete-after', True)
    
    # Остальные ключи - это источники (например, /TG/Station, Horizon)
    for source, source_data in data.items():
        if isinstance(source_data, dict):
            # source_data имеет вид { pr_number: { title: ..., changes: {...} } }
            for pr_number, pr_data in source_data.items():
                title = pr_data.get('title', '')
                changes_by_author = pr_data.get('changes', {})
                
                if changes_by_author:
                    # Сохраняем в архивную структуру
                    archive_data.setdefault(today_str, {}).setdefault(source, {})[pr_number] = {
                        'title': title,
                        'changes': changes_by_author
                    }
    
    return delete_after

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('ymlDir', help='Directory of YAML changelogs')
    args = parser.parse_args()

    yml_dir = args.ymlDir
    archive_dir = os.path.join(yml_dir, 'archive')
    month_str = today.strftime(fileDateFormat)
    archive_data = load_existing_archive(archive_dir, month_str)

    for filepath in glob.glob(os.path.join(yml_dir, "*.yml")):
        filename = os.path.basename(filepath)
        if filename.startswith('.') or filename == 'example.yml':
            continue
        
        print(f"Reading {filename}...")
        
        with open(filepath, 'r', encoding='utf-8') as f:
            try:
                # Читаем весь файл, сохраняя комментарии
                content = f.read()
                # Извлекаем комментарий с PR, если есть
                pr_comment = None
                if content.startswith('# PR:'):
                    lines = content.split('\n')
                    pr_comment = lines[0].strip()
                    yaml_content = '\n'.join(lines[1:])
                    data = yaml.safe_load(yaml_content)
                    if data:
                        data['_COMMENT'] = pr_comment
                else:
                    data = yaml.safe_load(content)
            except yaml.YAMLError as e:
                print(f"  Error parsing {filename}: {e}")
                continue
        
        if not data:
            continue
        
        # Обрабатываем файл
        delete_after = process_changelog_file(data, today.isoformat(), archive_data)
        
        # Удаляем файл если нужно
        if delete_after:
            print(f"  Deleting {filename}")
            os.remove(filepath)
        else:
            # Если delete-after: False, перемещаем в processed
            processed_dir = os.path.join(yml_dir, 'processed')
            os.makedirs(processed_dir, exist_ok=True)
            dest = os.path.join(processed_dir, filename)
            print(f"  Moving to {dest}")
            os.rename(filepath, dest)

    if archive_data:
        save_archive(archive_dir, month_str, archive_data)
        print(f"Saved archive for {month_str}")

if __name__ == '__main__':
    main()