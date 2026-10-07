"""Verify the simplified public download page and optional independent model release."""
from network_revisions import revisions
from pathlib import Path
import argparse, hashlib, io, json, subprocess, zipfile, urllib.request, tempfile, sys

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
        actual = json.loads(archive.read('manifest.json'))
        # Display labels can change without replacing immutable model weights.
        assert {k: v for k, v in actual.items() if k != 'name'} == {k: v for k, v in model.items() if k != 'name'}
        assert set(archive.namelist()) == {'manifest.json', *[f['name'] for f in model['files']]}
        for file in model['files']:
            payload = archive.read(file['name'])
            assert len(payload) == file['bytes']
            assert hashlib.sha256(payload).hexdigest() == file['sha256']


xpi_name = f'paper-nexus-{version}.xpi'
base='https://kanglab.cool/paper-nexus/'
installer_names=[f'Paper-Nexus-{version}-macOS.dmg',f'Paper-Nexus-{version}-Windows.exe']
checks=download('v'+version,installer_names)
xpi=urllib.request.urlopen(base+'v'+version+'/'+xpi_name,timeout=60).read()
entry=json.load(urllib.request.urlopen(base+'updates.json',timeout=30))['addons']['cite-lens@local.research']['updates'][0]
assert entry['version']==version and entry['update_link']==base+'v'+version+'/'+xpi_name
assert entry['update_hash']=='sha512:'+hashlib.sha512(xpi).hexdigest()
with zipfile.ZipFile(io.BytesIO(xpi)) as archive:
    files = {p.relative_to(ROOT/'addon').as_posix(): p for p in (ROOT/'addon').rglob('*')
             if p.is_file() and 'models' not in p.relative_to(ROOT/'addon').parts and p.suffix != '.wasm'}
    assert set(archive.namelist()) == set(files)|{'network-revisions.json'} and archive.testzip() is None
    assert archive.read('network-revisions.json') == revisions(ROOT)
    assert all(archive.read(name) == path.read_bytes() for name, path in files.items())
for name in installer_names:assert (out/name).stat().st_size<10*1024*1024
exe=(out/installer_names[1]).read_bytes();assert exe[:2]==b'MZ' and xpi not in exe
assert hashlib.sha256(xpi).hexdigest().encode() in exe
if sys.platform=='darwin':
 subprocess.run(['hdiutil','verify',str(out/installer_names[0])],check=True,stdout=subprocess.DEVNULL)
 with tempfile.TemporaryDirectory(prefix='nexus-public-') as mount:
  subprocess.run(['hdiutil','attach',str(out/installer_names[0]),'-readonly','-nobrowse','-mountpoint',mount],check=True,stdout=subprocess.DEVNULL)
  try:
   app=Path(mount)/'Paper Nexus Installer.app';assert not list(app.rglob('*.xpi'))
   config=json.loads((app/'Contents/Resources/installer.json').read_text());assert config['version']==version and config['plugin']['sha256']==hashlib.sha256(xpi).hexdigest()
  finally:subprocess.run(['hdiutil','detach',mount],check=True,stdout=subprocess.DEVNULL)
model_checks={}
if args.models:
 for row,model in zip(json.loads((ROOT/'addon/model-packages.json').read_text())['models'],catalog['models']):
  data=urllib.request.urlopen(row['url'],timeout=120).read();assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'];verify_model(data,model);model_checks[row['name']]=row['sha256']
latest = json.loads(subprocess.check_output(['gh','release','view','--repo',REPO,'--json','tagName']))
assert latest['tagName'] == 'v'+version, 'Model release must not replace the plugin latest release'
report = {'release': version, 'passed': True, 'publicSHA256': checks, 'modelSHA256': model_checks,
          'xpiMatchesSource': True, 'updateSHA512': True, 'latestStillPlugin': True}
(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n', encoding='utf-8')
print(json.dumps(report,indent=2))
