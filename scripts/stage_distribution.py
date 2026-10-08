"""Stage only the verified XPI and Zotero update manifest for Pages."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('destination', type=Path)
args = parser.parse_args()

VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
DESTINATION = args.destination.resolve()
DESTINATION.mkdir(parents=True, exist_ok=True)
XPI = ROOT / 'dist' / f'paper-nexus-{VERSION}.xpi'
UPDATES = ROOT / 'dist' / 'updates.json'
EXPECTED_LINK = f'https://kanglab.cool/paper-nexus/v{VERSION}/{XPI.name}'

updates = json.loads(UPDATES.read_text(encoding='utf-8'))['addons'][
    'cite-lens@local.research'
]['updates']
assert len(updates) == 1
entry = updates[0]
xpi_bytes = XPI.read_bytes()
assert entry['version'] == VERSION
assert entry['update_link'] == EXPECTED_LINK
assert entry['update_hash'] == 'sha512:' + hashlib.sha512(xpi_bytes).hexdigest()


def copy(source, relative, immutable=True):
    target = DESTINATION / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and immutable:
        assert target.read_bytes() == source.read_bytes(), \
            'Versioned downloads are immutable: ' + str(relative)
    shutil.copyfile(source, target)


copy(XPI, Path('v' + VERSION) / XPI.name)
copy(UPDATES, Path('updates.json'), immutable=False)
(DESTINATION / '.nojekyll').touch()
print('Staged one versioned XPI and its update manifest.')
