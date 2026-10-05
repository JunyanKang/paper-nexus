"""Execute the test-only command bridge in an already running isolated QA instance."""
from pathlib import Path
import time,json,uuid,sys,hashlib,datetime
root=Path(__file__).resolve().parents[1];results=root/'test-results'
files=sys.argv[1:] or ['native-integration.js','native-corpus.js','native-streamline.js','native-metric-card.js','native-responsive.js','native-ui.js','native-selection-race.js','native-authors.js','native-hover-paint.js','native-network.js','native-network-interaction.js','native-network-layout.js','native-citation-verification.js','native-updater.js','native-lifecycle.js','native-package.js']
if not (results/'ready.json').exists():raise SystemExit('Start scripts/qa.py with your PDF fixtures first.')
ready=json.loads((results/'ready.json').read_text())
if Path(ready['profile'])!=root/'qa-profile':raise SystemExit('Refusing to run outside QA profile.')
def source_hash():
 h=hashlib.sha256()
 for p in sorted((root/'addon').rglob('*')):
  if p.is_file():h.update(p.relative_to(root/'addon').as_posix().encode());h.update(p.read_bytes())
 return h.hexdigest()
for name in files:
 source=source_hash()
 if '/' in name or '\\' in name:raise SystemExit('Use a test filename, not a path.')
 path=results/'result.json';before=path.stat().st_mtime_ns if path.exists() else 0
 (results/'command.js').write_text((root/'tests'/name).read_text()+'\n// Run '+str(uuid.uuid4())+'\n')
 deadline=time.monotonic()+300
 while time.monotonic()<deadline:
  if path.exists() and path.stat().st_mtime_ns!=before:
   try:data=json.loads(path.read_text())
   except json.JSONDecodeError:time.sleep(.1);continue
   print(name,json.dumps({'ok':data.get('ok'),'passed':data.get('value',{}).get('passed'),'error':data.get('error') or data.get('value',{}).get('error')},ensure_ascii=False),flush=True)
   if not data.get('ok') or data.get('value',{}).get('passed') is not True:raise SystemExit(1)
   if source_hash()!=source:raise SystemExit('Addon changed during validation; rerun this suite')
   value=data.get('value',{})
   with (results/'native-ledger.jsonl').open('a') as ledger:
    ledger.write(json.dumps({'test':name,'run':value.get('run'),'release':json.loads((root/'package.json').read_text())['version'],'sourceSHA256':source,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'checks':[{'name':x['name'],'ok':x['ok']} for x in value.get('checks',[])]})+'\n')
   break
  time.sleep(.2)
 else:raise SystemExit('Timed out: '+name)
