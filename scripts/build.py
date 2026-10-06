"""Build a reproducible XPI and native Zotero update manifest."""
from pathlib import Path
import zipfile,json,hashlib,argparse
parser=argparse.ArgumentParser();parser.add_argument("--personal-adapter",type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'addon/manifest.json').read_text(encoding='utf-8'))
package=json.loads((root/'package.json').read_text(encoding='utf-8'));version=manifest['version']
assert version==package['version']
app=manifest['applications']['zotero']
assert app['id']=='cite-lens@local.research', 'Keep existing install identity'
assert app['update_url']=='https://github.com/JunyanKang/paper-nexus/releases/latest/download/updates.json'
suffix='-personal' if args.personal_adapter else ''
out=root/'dist'/f'paper-nexus-{version}{suffix}.xpi';out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted((root/'addon').rglob('*')):
  if p.is_file() and 'models' not in p.relative_to(root/'addon').parts and p.suffix!='.wasm':
   info=zipfile.ZipInfo(p.relative_to(root/'addon').as_posix(),(2026,10,5,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
   z.writestr(info,p.read_bytes())
 if args.personal_adapter:
  adapter=json.loads(args.personal_adapter.read_text(encoding='utf-8'));assert adapter['dimension']==384 and adapter['rank']>0 and adapter['model']=='Xenova/all-MiniLM-L6-v2'
  assert adapter['accepted'] is True, 'Only evaluated personal adapters may be included'
  info=zipfile.ZipInfo('models/personal/adapter.json',(2026,10,5,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,args.personal_adapter.read_bytes())
if args.personal_adapter:
 (out.parent/(out.name+'.sha256')).write_text(hashlib.sha256(out.read_bytes()).hexdigest()+'  '+out.name+'\n',encoding='utf-8')
 print(out.name);raise SystemExit(0)
update={'addons':{app['id']:{'updates':[{'version':version,'update_link':f'https://github.com/JunyanKang/paper-nexus/releases/download/v{version}/{out.name}','update_hash':'sha512:'+hashlib.sha512(out.read_bytes()).hexdigest(),'applications':{'zotero':{'strict_min_version':app['strict_min_version'],'strict_max_version':app['strict_max_version']}}}]}}}
(root/'dist/updates.json').write_text(json.dumps(update,indent=2)+'\n',encoding='utf-8')
(root/'dist/SHA256SUMS.txt').write_text(hashlib.sha256(out.read_bytes()).hexdigest()+'  '+out.name+'\n',encoding='utf-8')
print(out.name)
