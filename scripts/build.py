"""Build a reproducible XPI and native Zotero update manifest."""
from pathlib import Path
import zipfile,json,hashlib
from audit_release import addon_payload
from network_revisions import revisions, revision_script
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'addon/manifest.json').read_text(encoding='utf-8'))
package=json.loads((root/'package.json').read_text(encoding='utf-8'));version=manifest['version']
assert version==package['version']
app=manifest['applications']['zotero']
assert app['id']=='cite-lens@local.research', 'Keep existing install identity'
assert app['update_url']=='https://kanglab.cool/paper-nexus/updates.json'
distribution=app['update_url'].rsplit('/',1)[0]
out=root/'dist'/f'paper-nexus-{version}.xpi';out.parent.mkdir(exist_ok=True)
payload=addon_payload(root);revision_json=revisions(root);revision_js=revision_script(root)
temporary=out.with_name(out.name+'.tmp')
try:
 with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,p in sorted(payload.items()):
   info=zipfile.ZipInfo(name,(2026,10,5,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
   z.writestr(info,p.read_bytes())
  info=zipfile.ZipInfo('network-revisions.json',(2026,10,5,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,revision_json)
  info=zipfile.ZipInfo('network-revisions.js',(2026,10,5,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,revision_js)
 temporary.replace(out)
finally:
 if temporary.exists():temporary.unlink()
update={'addons':{app['id']:{'updates':[{'version':version,'update_link':f'{distribution}/v{version}/{out.name}','update_hash':'sha512:'+hashlib.sha512(out.read_bytes()).hexdigest(),'applications':{'zotero':{'strict_min_version':app['strict_min_version'],'strict_max_version':app['strict_max_version']}}}]}}}
(root/'dist/updates.json').write_text(json.dumps(update,indent=2)+'\n',encoding='utf-8')
(root/'dist/SHA256SUMS.txt').write_text(hashlib.sha256(out.read_bytes()).hexdigest()+'  '+out.name+'\n',encoding='utf-8')
print(out.name)
