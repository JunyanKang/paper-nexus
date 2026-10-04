"""Package only the reviewed Git index; private QA data never enter release archives."""
from pathlib import Path
import json,zipfile,hashlib,subprocess
root=Path(__file__).resolve().parents[1];version=json.loads((root/'package.json').read_text())['version'];dist=root/'dist';xpi=dist/f'paper-nexus-{version}.xpi'
with zipfile.ZipFile(xpi) as z:
 assert not z.testzip()
 expected={p.relative_to(root/'addon').as_posix():p for p in (root/'addon').rglob('*') if p.is_file()}
 assert set(z.namelist())==set(expected)
 assert all(z.read(name)==p.read_bytes() for name,p in expected.items()), 'Rebuild XPI: addon changed'
 assert not any('harness' in n or 'test' in n for n in z.namelist())
 for name in z.namelist():
  if name.endswith(('.js','.json')):
   data=z.read(name);assert b'/Users/' not in data and b'/Volumes/' not in data and b'command.js' not in data
files=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0');assert any(f=='README.md' for f in files),'Stage reviewed public files first'
source=dist/f'paper-nexus-{version}-source.zip'
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
 for name in sorted(filter(None,files)):
  assert not name.startswith(('.build/','test-results/','qa-','dist/','test-fixtures/'))
  z.write(root/name,Path('paper-nexus')/name)
assets=[xpi,dist/'updates.json',source];(dist/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in assets))
for p in assets:print(p.name,p.stat().st_size)
