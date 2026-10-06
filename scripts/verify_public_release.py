"""Download public release assets and verify hashes and source/index identity."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
from audit_release import public_index
root=Path(__file__).resolve().parents[1];version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version'];out=root/'.build'/('public-'+version);out.mkdir(parents=True,exist_ok=True)
subprocess.run(['gh','release','download','v'+version,'--repo','JunyanKang/paper-nexus','--dir',str(out),'--clobber'],check=True)
catalog=json.loads((root/'model-catalog.json').read_text(encoding='utf-8'))
expected={f'paper-nexus-{version}.xpi',f'paper-nexus-{version}-source.zip',f'paper-nexus-{version}-mac-windows.zip','updates.json','model-catalog.json',*[f"paper-nexus-{m['id']}-{m['version']}.pnmodel" for m in catalog['models']]}
checks={}
for line in (out/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
 digest,name=line.split();assert name in expected,'Unexpected asset';assert hashlib.sha256((out/name).read_bytes()).hexdigest()==digest,(name,'SHA256 mismatch');checks[name]=digest
assert set(checks)==expected
xpi=out/f'paper-nexus-{version}.xpi';entry=json.loads((out/'updates.json').read_text(encoding='utf-8'))['addons']['cite-lens@local.research']['updates'][0]
assert entry['version']==version and entry['update_link']==f'https://github.com/JunyanKang/paper-nexus/releases/download/v{version}/{xpi.name}'
assert entry['update_hash']=='sha512:'+hashlib.sha512(xpi.read_bytes()).hexdigest()
with zipfile.ZipFile(xpi) as z:
 files={p.relative_to(root/'addon').as_posix():p for p in (root/'addon').rglob('*') if p.is_file() and 'models' not in p.relative_to(root/'addon').parts and p.suffix!='.wasm'};assert set(z.namelist())==set(files);assert all(z.read(n)==p.read_bytes() for n,p in files.items());assert z.testzip() is None
names=public_index()
with zipfile.ZipFile(out/f'paper-nexus-{version}-source.zip') as z:
 assert set(z.namelist())=={'paper-nexus/'+n for n in names}
 for name in names:assert z.read('paper-nexus/'+name)==subprocess.check_output(['git','show',':'+name],cwd=root),name
assert json.loads((out/'model-catalog.json').read_text(encoding='utf-8'))==catalog
with zipfile.ZipFile(out/f'paper-nexus-{version}-mac-windows.zip') as z:
 for name in [xpi.name,f"paper-nexus-{catalog['models'][0]['id']}-{catalog['models'][0]['version']}.pnmodel"]:
  assert z.read(name)==(out/name).read_bytes()
for m in catalog['models']:
 with zipfile.ZipFile(out/f"paper-nexus-{m['id']}-{m['version']}.pnmodel") as z:
  assert json.loads(z.read('manifest.json'))==m and z.testzip() is None
  for f in m['files']:
   b=z.read(f['name']);assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']
report={'release':version,'passed':True,'publicSHA256':checks,'xpiMatchesSource':True,'sourceArchiveMatchesIndex':True,'updateSHA512':True};(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
