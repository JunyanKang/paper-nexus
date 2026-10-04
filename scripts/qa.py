"""Build a QA-only harness and start Zotero with an isolated profile and library."""
from pathlib import Path
import json,zipfile,subprocess,sys
root=Path(__file__).resolve().parents[1]
fixtures=Path(sys.argv[sys.argv.index('--fixtures')+1]).resolve() if '--fixtures' in sys.argv else root/'test-fixtures'
profile=root/'qa-profile';results=root/'test-results';library=root/'qa-library'
for p in [profile/'extensions',results,library]:p.mkdir(parents=True,exist_ok=True)
prefs={'extensions.zotero.dataDir':str(library),'extensions.zotero.useDataDir':True,'extensions.zotero.firstRun2':False,'extensions.zotero.firstRunGuidance':False,'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,'extensions.zotero.httpServer.enabled':False,'app.update.auto':False,'extensions.update.enabled':False}
(profile/'user.js').write_text(''.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});\n' for k,v in prefs.items()))
harness='''(async()=>{const base=__ROOT__;Zotero.CiteLensTestRoot=base;Zotero.CiteLensTestFixtures=__FIXTURES__;await IOUtils.writeUTF8(base+'/test-results/ready.json',JSON.stringify({version:Zotero.version,profile:Services.dirsvc.get('ProfD',Components.interfaces.nsIFile).path}));let busy=false,last='';Zotero.getMainWindow().setInterval(async()=>{if(busy)return;const path=base+'/test-results/command.js';if(!await IOUtils.exists(path))return;const code=await IOUtils.readUTF8(path);if(code===last)return;last=code;busy=true;try{const value=await new Function('Zotero','CiteLens','CiteLensCore','CiteLensServices','CiteLensUI','IOUtils','Services','ChromeUtils','Components','return (async()=>{'+code+'})()')(Zotero,CiteLens,CiteLensCore,CiteLensServices,CiteLensUI,IOUtils,Services,ChromeUtils,Components);await IOUtils.writeUTF8(base+'/test-results/result.json',JSON.stringify({ok:true,value},null,2));}catch(e){await IOUtils.writeUTF8(base+'/test-results/result.json',JSON.stringify({ok:false,error:String(e),stack:e.stack},null,2));}finally{busy=false;}},400);})();'''.replace('__ROOT__',json.dumps(str(root))).replace('__FIXTURES__',json.dumps(str(fixtures)))
with zipfile.ZipFile(profile/'extensions/cite-lens@local.research.xpi','w',zipfile.ZIP_DEFLATED) as z:
 for p in (root/'addon').rglob('*'):
  if not p.is_file():continue
  data=p.read_bytes()
  if p.name=='bootstrap.js':data=data.decode()+'\nvar originalStartup=startup;startup=async function(data,reason){try{await originalStartup(data,reason);Services.scriptloader.loadSubScript(data.rootURI+"qa-harness.js",CiteLensScope);}catch(e){await IOUtils.writeUTF8('+json.dumps(str(results/'startup-error.txt'))+',String(e)+"\\n"+e.stack);}};'
  z.writestr(p.relative_to(root/'addon').as_posix(),data)
 z.writestr('qa-harness.js',harness)
if '--build-only' not in sys.argv:
 log=open(results/'zotero.log','w')
 proc=subprocess.Popen(['/Applications/Zotero.app/Contents/MacOS/zotero','-no-remote','-profile',str(profile),'-ZoteroDebugText'],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (results/'qa.pid').write_text(str(proc.pid));print('Isolated Zotero QA PID:',proc.pid)
