import yaml
import os
import sys
import glob
import json
import shutil
import re
import urllib.request
from datetime import date

CHANGELOG_TYPE_MAPPING = {
    'bugfix': 'bugfix', 'fix': 'bugfix',
    'tweak': 'tweak', 'qol': 'tweak',
    'soundadd': 'sound', 'sounddel': 'sound',
    'rscadd': 'rscadd', 'add': 'rscadd',
    'rscdel': 'rscdel', 'del': 'rscdel',
    'imageadd': 'image', 'imagedel': 'image',
    'spellcheck': 'spellcheck', 'balance': 'balance',
    'code_imp': 'code_imp', 'refactor': 'code_imp',
    'config': 'server', 'server': 'server',
    'sound': 'sound', 'image': 'image',
    'map': 'map', 'admin': 'admin'
}

today = date.today()
month_key = today.strftime("%Y-%m")

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')

def fetch_pr_body(repo, pr_number):
    if not repo or not pr_number:
        return ""

    url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"
    req = urllib.request.Request(url)
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('User-Agent', 'Horizon-Changelog-Compiler')
    if GITHUB_TOKEN:
        req.add_header('Authorization', f'token {GITHUB_TOKEN}')

    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('body', '') or ''
    except Exception as e:
        print(f"  [WARNING] Не удалось скачать тело PR #{pr_number} из {repo}: {e}")
        return ""

def extract_body_from_pr(full_body):
    if not full_body:
        return ""

    pattern = r'(?i)(##\s*Changelog|##\s*Список\s*изменений|🆑|:cl:)'
    parts = re.split(pattern, full_body, maxsplit=1)
    body = parts[0].strip()
    return body

def load_existing_json(archive_dir):
    json_file = os.path.join(archive_dir, month_key + '.json')
    if os.path.exists(json_file):
        with open(json_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_json(archive_dir, data):
    os.makedirs(archive_dir, exist_ok=True)
    json_file = os.path.join(archive_dir, month_key + '.json')
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def parse_changelog_file(filepath):
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
            repo = pr_data.get('repo', '')
            body = pr_data.get('body', '')

            if not body and repo:
                print(f"  Fetching body for {repo}#{pr_number}...")
                full_body = fetch_pr_body(repo, pr_number)
                body = extract_body_from_pr(full_body)

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
                    'repo': repo,
                    'pr': str(pr_number),
                    'title': title,
                    'author': author,
                    'body': body,
                    'changes': parsed_changes,
                })

    return records

def get_record_key(record):
    return f"{record['source']}|{record['pr']}|{record['author']}|{record['title']}"

def main():
    if len(sys.argv) != 2:
        print("Usage: python compile_changelogs.py <changelogs_dir>")
        sys.exit(1)

    changelogs_dir = sys.argv[1]
    archive_dir = os.path.join(changelogs_dir, 'archive')
    processed_dir = os.path.join(changelogs_dir, 'processed')

    existing_records = load_existing_json(archive_dir)
    existing_keys = {get_record_key(r) for r in existing_records}

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

        os.makedirs(processed_dir, exist_ok=True)
        shutil.move(filepath, os.path.join(processed_dir, filename))

    if new_records:
        all_records = existing_records + new_records
        save_json(archive_dir, all_records)
        print(f"\nSaved {len(new_records)} new records to {month_key}.json (total: {len(all_records)})")
    else:
        print("\nNo new records to add")

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