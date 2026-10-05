"""Download public release assets and verify hashes and source/index identity."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
root=Path(__file__).resolve().parents[1];version=json.loads((root/'package.json').read_text())['version'];out=root/'.build'/('public-'+version);out.mkdir(parents=True,exist_ok=True)
subprocess.run(['gh','release','download','v'+version,'--repo','JunyanKang/paper-nexus','--dir',str(out),'--clobber'],check=True)
expected={f'paper-nexus-{version}.xpi',f'paper-nexus-{version}-source.zip','updates.json'}
checks={}
for line in (out/'SHA256SUMS.txt').read_text().splitlines():
 digest,name=line.split();assert name in expected,'Unexpected asset';assert hashlib.sha256((out/name).read_bytes()).hexdigest()==digest,(name,'SHA256 mismatch');checks[name]=digest
assert set(checks)==expected
xpi=out/f'paper-nexus-{version}.xpi';entry=json.loads((out/'updates.json').read_text())['addons']['cite-lens@local.research']['updates'][0]
assert entry['version']==version and entry['update_link']==f'https://github.com/JunyanKang/paper-nexus/releases/download/v{version}/{xpi.name}'
assert entry['update_hash']=='sha512:'+hashlib.sha512(xpi.read_bytes()).hexdigest()
with zipfile.ZipFile(xpi) as z:
 files={p.relative_to(root/'addon').as_posix():p for p in (root/'addon').rglob('*') if p.is_file()};assert set(z.namelist())==set(files);assert all(z.read(n)==p.read_bytes() for n,p in files.items());assert z.testzip() is None
names=set(filter(None,subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')))
with zipfile.ZipFile(out/f'paper-nexus-{version}-source.zip') as z:
 assert set(z.namelist())=={'paper-nexus/'+n for n in names}
 for name in names:assert z.read('paper-nexus/'+name)==subprocess.check_output(['git','show',':'+name],cwd=root),name
report={'release':version,'passed':True,'publicSHA256':checks,'xpiMatchesSource':True,'sourceArchiveMatchesIndex':True,'updateSHA512':True};(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
