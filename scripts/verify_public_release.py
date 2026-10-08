"""Verify the one-asset GitHub release and the public Zotero update route."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import urllib.request
import zipfile

from audit_release import addon_payload
from network_revisions import revision_script, revisions


ROOT = Path(__file__).resolve().parents[1]
REPO = 'JunyanKang/paper-nexus'
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
TAG = 'v' + VERSION
XPI_NAME = f'paper-nexus-{VERSION}.xpi'
BASE_URL = 'https://kanglab.cool/paper-nexus/'
EXPECTED_URL = f'{BASE_URL}v{VERSION}/{XPI_NAME}'
OUT = ROOT / '.build' / ('public-' + VERSION)
OUT.mkdir(parents=True, exist_ok=True)


release = json.loads(subprocess.check_output([
    'gh', 'release', 'view', TAG, '--repo', REPO,
    '--json', 'assets,isDraft,tagName',
]))
assert not release['isDraft'] and release['tagName'] == TAG
assets = {asset['name']: asset for asset in release['assets']}
assert set(assets) == {XPI_NAME}, \
    'Release must contain only ' + XPI_NAME + ': ' + str(sorted(assets))

subprocess.run([
    'gh', 'release', 'download', TAG, '--repo', REPO,
    '--dir', str(OUT), '--clobber', '--pattern', XPI_NAME,
], check=True)
github_xpi = (OUT / XPI_NAME).read_bytes()
github_sha256 = hashlib.sha256(github_xpi).hexdigest()
asset = assets[XPI_NAME]
assert asset['state'] == 'uploaded'
assert len(github_xpi) == asset['size']
assert asset['digest'] == 'sha256:' + github_sha256

with urllib.request.urlopen(BASE_URL + 'updates.json', timeout=30) as response:
    public_updates = json.load(response)
updates = public_updates['addons']['cite-lens@local.research']['updates']
assert len(updates) == 1
entry = updates[0]
assert entry['version'] == VERSION
assert entry['update_link'] == EXPECTED_URL

with urllib.request.urlopen(entry['update_link'], timeout=60) as response:
    public_xpi = response.read()
assert public_xpi == github_xpi, 'Public XPI differs from the GitHub release asset'
public_sha512 = hashlib.sha512(public_xpi).hexdigest()
assert entry['update_hash'] == 'sha512:' + public_sha512

with zipfile.ZipFile(io.BytesIO(public_xpi)) as archive:
    expected = addon_payload(ROOT)
    generated = {'network-revisions.json', 'network-revisions.js'}
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(expected) | generated
    assert archive.read('network-revisions.json') == revisions(ROOT)
    assert archive.read('network-revisions.js') == revision_script(ROOT)
    assert all(archive.read(name) == path.read_bytes() for name, path in expected.items())

latest = json.loads(subprocess.check_output([
    'gh', 'release', 'view', '--repo', REPO, '--json', 'tagName',
]))
assert latest['tagName'] == TAG

report = {
    'release': VERSION,
    'passed': True,
    'githubAssets': [XPI_NAME],
    'githubSHA256': github_sha256,
    'githubDigestVerified': True,
    'publicXpiMatchesGithub': True,
    'xpiMatchesSource': True,
    'updateSHA512': True,
    'publicSHA512': public_sha512,
    'latestIsRelease': True,
}
(OUT / 'verification.json').write_text(
    json.dumps(report, indent=2) + '\n', encoding='utf-8'
)
print(json.dumps(report, indent=2))
