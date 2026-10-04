"""Private QA baseline for the first public update channel; never a user release."""
from pathlib import Path
import json,zipfile
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
out=root/'.build/paper-nexus-0.3.99-qa-seed.xpi';out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(root/'dist'/f'paper-nexus-{version}.xpi') as src,zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as dst:
 for name in src.namelist():
  data=src.read(name)
  if name=='manifest.json':
   m=json.loads(data);m['version']='0.3.99';m['name']='Paper Nexus · UPDATE QA SEED';data=json.dumps(m,ensure_ascii=False).encode()
  if name=='bootstrap.js':
   data+=b'\nvar startProduction=startup;startup=async function(data,reason){await startProduction(data,reason);Zotero.PaperNexusUpdateQA=CiteLensScope;};\n'
  dst.writestr(name,data)
print(out.name)
