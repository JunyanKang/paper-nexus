"""Verify the simplified public download page and optional independent model release."""
from pathlib import Path
import argparse, hashlib, io, json, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = 'JunyanKang/paper-nexus'
version = json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
catalog = json.loads((ROOT/'model-catalog.json').read_text(encoding='utf-8'))
out = ROOT/'.build'/('public-'+version)
out.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--models', action='store_true', help='Also verify the independent model release')
args = parser.parse_args()


def download(tag, expected):
    release = json.loads(subprocess.check_output([
        'gh', 'release', 'view', tag, '--repo', REPO, '--json', 'assets,isDraft,tagName'
    ]))
    assert not release['isDraft'] and release['tagName'] == tag
    assets = {a['name']: a for a in release['assets']}
    assert set(assets) == set(expected), 'Unexpected or missing release assets: ' + str(set(assets)^set(expected))
    command = ['gh', 'release', 'download', tag, '--repo', REPO, '--dir', str(out), '--clobber']
    for name in expected:
        command.extend(['--pattern', name])
    subprocess.run(command, check=True)
    hashes = {}
    for name in expected:
        data = (out/name).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        assert assets[name]['state'] == 'uploaded' and len(data) == assets[name]['size']
        assert assets[name]['digest'] == 'sha256:'+digest, name+' digest mismatch'
        hashes[name] = digest
    return hashes


def verify_model(data, model):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.testzip() is None
        assert json.loads(archive.read('manifest.json')) == model
        assert set(archive.namelist()) == {'manifest.json', *[f['name'] for f in model['files']]}
        for file in model['files']:
            payload = archive.read(file['name'])
            assert len(payload) == file['bytes']
            assert hashlib.sha256(payload).hexdigest() == file['sha256']


xpi_name = f'paper-nexus-{version}.xpi'
installer_names=[f'Paper-Nexus-{version}-{platform}.zip' for platform in ['macOS','Windows']]
checks = download('v'+version, [*installer_names, xpi_name, 'updates.json'])
xpi = (out/xpi_name).read_bytes()
entry = json.loads((out/'updates.json').read_text(encoding='utf-8'))['addons']['cite-lens@local.research']['updates'][0]
assert entry['version'] == version
assert entry['update_link'] == f'https://github.com/{REPO}/releases/download/v{version}/{xpi_name}'
assert entry['update_hash'] == 'sha512:'+hashlib.sha512(xpi).hexdigest()
with zipfile.ZipFile(io.BytesIO(xpi)) as archive:
    files = {p.relative_to(ROOT/'addon').as_posix(): p for p in (ROOT/'addon').rglob('*')
             if p.is_file() and 'models' not in p.relative_to(ROOT/'addon').parts and p.suffix != '.wasm'}
    assert set(archive.namelist()) == set(files) and archive.testzip() is None
    assert all(archive.read(name) == path.read_bytes() for name, path in files.items())
for name in installer_names:
    assert (out/name).stat().st_size<10*1024*1024
    with zipfile.ZipFile(out/name) as archive:
        assert archive.testzip() is None
        if 'macOS' in name:
            prefix='Paper Nexus Installer.app/Contents/Resources/'
            assert archive.read(prefix+'plugin.xpi')==xpi
            config=json.loads(archive.read(prefix+'installer.json'))
            assert config['version']==version and config['plugin']['sha256']==hashlib.sha256(xpi).hexdigest()
        else:
            assert set(archive.namelist())=={'Paper Nexus Setup.exe'}
            assert xpi in archive.read('Paper Nexus Setup.exe')
model_checks = {}
if args.models:
    model_version = max((m['version'] for m in catalog['models']), key=lambda v: tuple(map(int,v.split('.'))))
    names = [f"paper-nexus-{m['id']}-{m['version']}.pnmodel" for m in catalog['models']]
    model_checks = download('models-v'+model_version, names)
    for name, model in zip(names, catalog['models']):
        verify_model((out/name).read_bytes(), model)
latest = json.loads(subprocess.check_output(['gh','release','view','--repo',REPO,'--json','tagName']))
assert latest['tagName'] == 'v'+version, 'Model release must not replace the plugin latest release'
report = {'release': version, 'passed': True, 'publicSHA256': checks, 'modelSHA256': model_checks,
          'xpiMatchesSource': True, 'updateSHA512': True, 'latestStillPlugin': True}
(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n', encoding='utf-8')
print(json.dumps(report,indent=2))
