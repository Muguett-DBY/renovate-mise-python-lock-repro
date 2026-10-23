"""Run Renovate's real mise artifact updater in a new, isolated checkout."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--renovate', type=Path, required=True)
parser.add_argument('--node', default='node')
parser.add_argument('--output', type=Path)
parser.add_argument('--safe', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent
output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix='mise-repro-'))
output.mkdir(parents=True, exist_ok=True)
work = output / 'checkout'
if work.exists():
    parser.error('The output checkout already exists. Choose a fresh output directory.')

allowed = {'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP',
           'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
           'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'HTTP_PROXY', 'HTTPS_PROXY',
           'NO_PROXY', 'LANG'}
env = {k: v for k, v in os.environ.items() if k.upper() in allowed}
for key, name in [('MISE_DATA_DIR', 'data'), ('MISE_CACHE_DIR', 'cache'),
                  ('MISE_CONFIG_DIR', 'config'), ('MISE_STATE_DIR', 'state'),
                  ('UV_CACHE_DIR', 'uv-cache')]:
    env[key] = str(output / name)
empty_config = output / 'empty-global.toml'
empty_config.write_text('', encoding='utf-8')
env.update(MISE_GLOBAL_CONFIG_FILE=str(empty_config), MISE_YES='1', MISE_COLOR='0',
           UV_PYTHON=sys.executable, UV_PYTHON_DOWNLOADS='never',
           RENOVATE_REPRO_CACHE=str(output / 'renovate-cache'))
command = [args.node, str(root / 'verify.mjs'), str(args.renovate.resolve()),
           str(root), str(work), str(output / 'result.json')]
if args.safe:
    command.append('--safe')
run = subprocess.run(command, env=env)
print('Evidence and checkout retained in:', output)
sys.exit(run.returncode)
