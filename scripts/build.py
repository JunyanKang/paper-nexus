"""Build a reproducible XPI and native Zotero update manifest."""
from pathlib import Path
import zipfile,json,hashlib
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'addon/manifest.json').read_text())
package=json.loads((root/'package.json').read_text());version=manifest['version']
assert version==package['version']
app=manifest['applications']['zotero']
assert app['id']=='cite-lens@local.research', 'Keep existing install identity'
assert app['update_url']=='https://github.com/JunyanKang/paper-nexus/releases/latest/download/updates.json'
out=root/'dist'/f'paper-nexus-{version}.xpi';out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted((root/'addon').rglob('*')):
  if p.is_file():
   info=zipfile.ZipInfo(p.relative_to(root/'addon').as_posix(),(2026,10,5,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
   z.writestr(info,p.read_bytes())
update={'addons':{app['id']:{'updates':[{'version':version,'update_link':f'https://github.com/JunyanKang/paper-nexus/releases/download/v{version}/{out.name}','update_hash':'sha512:'+hashlib.sha512(out.read_bytes()).hexdigest(),'applications':{'zotero':{'strict_min_version':app['strict_min_version'],'strict_max_version':app['strict_max_version']}}}]}}}
(root/'dist/updates.json').write_text(json.dumps(update,indent=2)+'\n')
(root/'dist/SHA256SUMS.txt').write_text(hashlib.sha256(out.read_bytes()).hexdigest()+'  '+out.name+'\n')
print(out.name)
