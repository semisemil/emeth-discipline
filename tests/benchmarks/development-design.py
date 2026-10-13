"""Compare instruction text only. This does not measure total agent usage or quality."""
import argparse
import json
import hashlib
from pathlib import Path
import subprocess
import tiktoken

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before-ref', required=True, help='Explicit pre-change Git revision')
args = parser.parse_args()
revision = subprocess.check_output(['git', 'rev-parse', '--verify', args.before_ref + '^{commit}'], cwd=ROOT, text=True).strip()
encoding = tiktoken.get_encoding('o200k_base')

before = [
    'skills/development-plan/SKILL.md',
    'skills/implementation-spec/SKILL.md',
    'skills/implementation-spec/references/document-operations.md',
    'skills/tenet-me/SKILL.md',
    'skills/figure-it-out/SKILL.md',
    'skills/figure-it-out/references/preparation-task.md',
]
after = [
    'skills/development-design/SKILL.md',
    'skills/development-design/references/document-operations.md',
    'skills/tenet-me/SKILL.md',
    'skills/figure-it-out/SKILL.md',
]
memory = ['skills/architecture-memory/SKILL.md', 'skills/architecture-memory/references/recording.md']

def measure(files, old):
    measured = []
    for file in files:
        text = (subprocess.check_output(['git', 'show', f'{revision}:{file}'], cwd=ROOT).decode('utf-8')
                if old else (ROOT / "plugins/emeth-discipline" / file).read_text(encoding='utf-8'))
        normalized = text.replace('\r\n', '\n')
        measured.append({'path': file, 'tokens': len(encoding.encode(normalized)),
                         'sha256': hashlib.sha256(normalized.encode('utf-8')).hexdigest()})
    return {'tokens': sum(row['tokens'] for row in measured), 'files': measured}

scenarios = []
for name, old_files, new_files in [
    ('design_preparation_and_review', before, after),
    ('preparation_with_memory_capture', before + memory, after + memory),
]:
    old = measure(old_files, True)
    new = measure(new_files, False)
    scenarios.append({'name': name, 'before': old, 'after': new,
                      'change_percent': round((new['tokens'] / old['tokens'] - 1) * 100, 1)})
print(json.dumps({'scope': 'instruction_text_only', 'tokenizer': 'o200k_base', 'before_revision': revision,
                  'total_agent_usage_measured': False, 'scenarios': scenarios}, ensure_ascii=False, indent=2))
