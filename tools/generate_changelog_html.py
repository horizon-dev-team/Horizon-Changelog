#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import yaml
import os
import sys
import glob
from datetime import datetime

# Маппинг типов изменений на CSS классы
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
    # pr_number может быть просто номером или в формате owner/repo/number
    parts = str(pr_number).split('/')
    if len(parts) >= 3:
        pr_id = parts[-1]
        owner, repo = parts[0], parts[1]
        return f"https://github.com/{owner}/{repo}/pull/{pr_id}"
    else:
        # Если только номер, используем дефолтный репозиторий
        return f"https://github.com/horizon-dev-team/HORIZON-Project-Prototype/pull/{pr_number}"

def generate_html(entries, template_file, output_file):
    """Генерирует HTML файл с changelog'ами."""
    sorted_dates = sorted(entries.keys(), reverse=True)

    with open(template_file, 'r', encoding='utf-8') as f:
        template = f.read()

    changelog_start = template.find('<div id="changelogs">')
    if changelog_start == -1:
        print("Error: Could not find changelogs div", file=sys.stderr)
        return False

    changelog_end = template.find('</div>', changelog_start)
    if changelog_end == -1:
        print("Error: Could not find closing changelogs div", file=sys.stderr)
        return False

    html_parts = []

    for date_key in sorted_dates:
        date_obj = datetime.strptime(date_key, "%Y-%m-%d").date()
        
        html_parts.append(f'    <div class="row" data-date="{format_date(date_obj)}">')
        html_parts.append('     <div class="col-lg-12">')
        html_parts.append('     <section class="section">')
        html_parts.append(f'        <section class="section_title"><h3 class="row-header">{format_date(date_obj)}</h3></section>')
        html_parts.append('     <section class="section_container">')

        for source in sorted(entries[date_key].keys()):
            source_data = entries[date_key][source]
            
            html_parts.append(f'      <div data-author="{source}">')
            html_parts.append(f'       <h4 class="source">{source}:</h4>')
            
            # Сортируем PR по номеру
            for pr_number in sorted(source_data.keys(), key=lambda x: int(str(x).split('/')[-1])):
                pr_data = source_data[pr_number]
                title = pr_data.get('title', '')
                changes_by_author = pr_data.get('changes', {})
                
                # Заголовок PR
                pr_link = build_pr_link(pr_number)
                pr_display = pr_number.split('/')[-1] if '/' in str(pr_number) else pr_number
                
                if title:
                    html_parts.append(f'       <h5 class="title">{title} (<a href="{pr_link}">#{pr_display}</a>)</h5>')
                else:
                    html_parts.append(f'       <h5 class="title"><a href="{pr_link}">PR #{pr_display}</a></h5>')
                
                # Выводим изменения по авторам
                for author in sorted(changes_by_author.keys()):
                    changes = changes_by_author[author]
                    html_parts.append(f'       <h6 class="author">{author}:</h6>')
                    html_parts.append('       <ul class="changelog">')
                    
                    for change in changes:
                        # change уже в формате {type: description}
                        if isinstance(change, dict):
                            change_type, description = list(change.items())[0]
                        else:
                            # Если строка, пытаемся распарсить
                            parts = str(change).split(': ', 1)
                            if len(parts) == 2:
                                change_type, description = parts
                            else:
                                change_type, description = 'tweak', str(change)
                        
                        css_class = CHANGELOG_TYPE_MAPPING.get(change_type.lower(), 'tweak')
                        html_parts.append(f'        <li class="{css_class}">{description}</li>')
                    
                    html_parts.append('       </ul>')
            
            html_parts.append('      </div>')

        html_parts.append('        </section>')
        html_parts.append('     </section>')
        html_parts.append('     </div>')
        html_parts.append('    </div>')

    final_html = (template[:changelog_start + len('<div id="changelogs">')] +
                  '\n' + '\n'.join(html_parts) +
                  template[changelog_end:])
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(final_html)
    
    return True

def main():
    if len(sys.argv) != 3:
        print("Usage: python generate_changelog_html.py <changelogs_dir> <output_html>")
        sys.exit(1)

    changelogs_dir = sys.argv[1]
    output_html = sys.argv[2]
    
    archive_dir = os.path.join(changelogs_dir, 'archive')
    if not os.path.exists(archive_dir):
        print(f"Error: Archive directory not found: {archive_dir}", file=sys.stderr)
        sys.exit(1)

    entries = load_changelog_entries(archive_dir)

    template_file = os.path.join(os.path.dirname(output_html), 'index_template.html')
    if not os.path.exists(template_file) and os.path.exists(output_html):
        template_file = output_html
    
    if not os.path.exists(template_file):
        print(f"Error: Template not found: {template_file}", file=sys.stderr)
        sys.exit(1)

    if generate_html(entries, template_file, output_html):
        print(f"Successfully generated {output_html}")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()