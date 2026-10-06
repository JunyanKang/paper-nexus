"""Validate the two installers and updater assets; keep model releases independent."""
from pathlib import Path
import json,zipfile,hashlib,re,subprocess,tempfile
from audit_release import public_index
root=Path(__file__).resolve().parents[1];version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version'];dist=root/'dist';xpi=dist/f'paper-nexus-{version}.xpi'
with zipfile.ZipFile(xpi) as z:
 assert not z.testzip()
 expected={p.relative_to(root/'addon').as_posix():p for p in (root/'addon').rglob('*') if p.is_file() and 'models' not in p.relative_to(root/'addon').parts and p.suffix!='.wasm'}
 assert set(z.namelist())==set(expected)
 assert all(z.read(name)==p.read_bytes() for name,p in expected.items()), 'Rebuild XPI: addon changed'
 assert not any('harness' in n or 'test' in n for n in z.namelist())
 for name in z.namelist():
  if name.endswith(('.js','.json')):
   data=z.read(name);assert not re.search(rb'/(?:Users|Volumes)/',data) and b'command.js' not in data
files=public_index();assert 'README.md' in files,'Stage reviewed public files first'
catalog=json.loads((root/'model-catalog.json').read_text(encoding='utf-8'))
assert catalog==json.loads((root/'addon/model-catalog.json').read_text(encoding='utf-8'))
packs=[]
for model in catalog['models']:
 pack=dist/f"paper-nexus-{model['id']}-{model['version']}.pnmodel"
 with zipfile.ZipFile(pack) as z:
  assert z.testzip() is None
  assert json.loads(z.read('manifest.json'))==model
  assert set(z.namelist())=={'manifest.json',*[f['name'] for f in model['files']]}
  for f in model['files']:
   b=z.read(f['name']);assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']
 packs.append(pack)
installers=[dist/f'Paper-Nexus-{version}-macOS.dmg',dist/f'Paper-Nexus-{version}-Windows.exe']
for installer in installers:assert installer.stat().st_size<10*1024*1024, 'Installer should not contain weights'
subprocess.run(['hdiutil','verify',str(installers[0])],check=True,stdout=subprocess.DEVNULL)
with tempfile.TemporaryDirectory(prefix='nexus-image-') as mount:
 subprocess.run(['hdiutil','attach',str(installers[0]),'-readonly','-nobrowse','-mountpoint',mount],check=True,stdout=subprocess.DEVNULL)
 try:
  app=Path(mount)/'Paper Nexus Installer.app'
  assert not list(app.rglob('*.xpi'))
  config=json.loads((app/'Contents/Resources/installer.json').read_text());assert config['plugin']['sha256']==hashlib.sha256(xpi.read_bytes()).hexdigest()
 finally:subprocess.run(['hdiutil','detach',mount],check=True,stdout=subprocess.DEVNULL)
exe=installers[1].read_bytes();assert exe[:2]==b'MZ' and xpi.read_bytes() not in exe
assert hashlib.sha256(xpi.read_bytes()).hexdigest().encode() in exe, 'Windows download catalog must match XPI'
assets=installers
model_version=max((m['version'] for m in catalog['models']),key=lambda value:tuple(map(int,value.split('.'))))
def describe(paths):
 return [{'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
# Internal publishing plan only. Never upload dist/* or this bookkeeping file.
plan={'plugin':{'tag':'v'+version,'assets':describe(assets)},'distribution':{'files':describe([xpi,dist/'updates.json',*packs])}}
(dist/'release-assets.json').write_text(json.dumps(plan,indent=2)+'\n',encoding='utf-8')
print(plan['plugin']['tag'])
for asset in plan['plugin']['assets']:print(' ',asset['name'],asset['bytes'])
