"""Validate the sole XPI release asset and its public update manifest."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

from audit_release import addon_payload, public_index
from network_revisions import revision_script, revisions


ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
DIST = ROOT / 'dist'
XPI = DIST / f'paper-nexus-{VERSION}.xpi'
UPDATES = DIST / 'updates.json'
EXPECTED_LINK = f'https://kanglab.cool/paper-nexus/v{VERSION}/{XPI.name}'


with zipfile.ZipFile(XPI) as archive:
    assert archive.testzip() is None
    expected = addon_payload(ROOT)
    generated = {'network-revisions.json', 'network-revisions.js'}
    assert set(archive.namelist()) == set(expected) | generated
    assert archive.read('network-revisions.json') == revisions(ROOT)
    assert archive.read('network-revisions.js') == revision_script(ROOT)
    assert all(archive.read(name) == path.read_bytes() for name, path in expected.items()), \
        'Rebuild XPI: addon source changed'
    assert not any('harness' in name or 'test' in name for name in archive.namelist())
    for name in expected:
        if name.endswith(('.js', '.json')):
            data = archive.read(name)
            assert not re.search(rb'/(?:Users|Volumes)/', data)
            assert b'command.js' not in data

updates = json.loads(UPDATES.read_text(encoding='utf-8'))['addons'][
    'cite-lens@local.research'
]['updates']
assert len(updates) == 1
entry = updates[0]
xpi_bytes = XPI.read_bytes()
assert entry['version'] == VERSION
assert entry['update_link'] == EXPECTED_LINK
assert entry['update_hash'] == 'sha512:' + hashlib.sha512(xpi_bytes).hexdigest()

files = public_index()
assert 'README.md' in files, 'Stage reviewed public files first'


def describe(path):
    data = path.read_bytes()
    return {
        'name': path.name,
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    }


xpi_description = describe(XPI)
plan = {
    'plugin': {
        'tag': 'v' + VERSION,
        'assets': [xpi_description],
    },
    'distribution': {
        'files': [xpi_description, describe(UPDATES)],
    },
}
(DIST / 'release-assets.json').write_text(
    json.dumps(plan, indent=2) + '\n', encoding='utf-8'
)
print(plan['plugin']['tag'])
print(' ', xpi_description['name'], xpi_description['bytes'])
