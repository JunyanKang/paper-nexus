"""Package only the reviewed Git index; private QA data never enter release archives."""
from pathlib import Path
import json,zipfile,hashlib,subprocess,re
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
source=dist/f'paper-nexus-{version}-source.zip'
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
 for name in sorted(filter(None,files)):
  assert not name.startswith(('.build/','test-results/','qa-','dist/','test-fixtures/'))
  info=zipfile.ZipInfo((Path('paper-nexus')/name).as_posix(),(2026,10,5,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
  z.writestr(info,subprocess.check_output(['git','show',':'+name],cwd=root))
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
(dist/'model-catalog.json').write_bytes((root/'model-catalog.json').read_bytes())
bundle=dist/f'paper-nexus-{version}-mac-windows.zip'
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
 for p in [xpi,packs[0]]:
  info=zipfile.ZipInfo(p.name,(2026,10,6,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,p.read_bytes())
 info=zipfile.ZipInfo('INSTALL.txt',(2026,10,6,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
 z.writestr(info,f"Paper Nexus {version} — macOS / Windows\n\n1. Zotero: Tools > Plugins > gear > Install Plugin From File. Select the .xpi.\n2. Paper Nexus: Settings > General > Local model > Import. Select the .pnmodel.\n3. Open Literature Network. Your private index is built on this computer.\n\nInstall the model once; later XPI updates retain it and your index.\nNo Python, Node.js or separate server is needed.\n\n中文指南：https://github.com/JunyanKang/paper-nexus/blob/main/docs/INSTALL.md\n")
assets=[xpi,dist/'updates.json',source,dist/'model-catalog.json',bundle,*packs];(dist/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in assets),encoding='utf-8')
for p in assets:print(p.name,p.stat().st_size)
