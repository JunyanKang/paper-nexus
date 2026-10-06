"""Build portable, data-only offline model packs from pinned, verified assets."""
from pathlib import Path
import hashlib,json,urllib.request,zipfile,argparse,time
ROOT=Path(__file__).resolve().parents[1]
def file_for(entry):
 p=ROOT/'.build/model-files'/entry['sha256'];p.parent.mkdir(parents=True,exist_ok=True)
 def valid():return p.exists() and p.stat().st_size==entry['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256']
 if valid():return p
 for retry in range(3):
  try:
   with urllib.request.urlopen(entry['url'],timeout=180) as r:p.write_bytes(r.read(entry['bytes']+1))
   if not valid():raise ValueError('Model integrity mismatch: '+entry['name'])
   return p
  except Exception:
   if retry==2:raise
   time.sleep(1+retry)
def build(model):
 out=ROOT/'dist'/f"paper-nexus-{model['id']}-{model['version']}.pnmodel";out.parent.mkdir(exist_ok=True)
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  content={'manifest.json':json.dumps(model,ensure_ascii=False,indent=2).encode(),**{f['name']:file_for(f).read_bytes() for f in model['files']}}
  for name,data in sorted(content.items()):
   info=zipfile.ZipInfo(name,(2026,10,6,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,data)
 print(out.name,out.stat().st_size)
 return out
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--model',choices=['minilm','medembed']);args=parser.parse_args()
 for m in json.loads((ROOT/'model-catalog.json').read_text(encoding='utf-8'))['models']:
  if not args.model or m['id']==args.model:build(m)
