"""Exercise native installers against disposable data directories, never a user profile."""
from pathlib import Path
import json,subprocess,sys,tempfile,hashlib,shutil,argparse
ROOT=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--online',action='store_true');args=parser.parse_args()
base=ROOT/'.build/installers';config=json.loads((base/'installer.json').read_text(encoding='utf-8'))
exe=base/'Paper Nexus Installer.app/Contents/MacOS/Paper Nexus Installer' if sys.platform=='darwin' else base/'Paper Nexus Setup.exe'
checks=[]
with tempfile.TemporaryDirectory(prefix='nexus-installer-') as scratch:
 root=Path(scratch);data=root/'data';data.mkdir();(data/'zotero.sqlite').write_text('installer test marker, not a real library');downloads=root/'plugins'
 def run(ids='minilm',success=True,extra=None,directory=data,online=False):
  cmd=[str(exe),'--quiet','--data-dir',str(directory),'--download-dir',str(downloads),'--model',ids]
  if not online:cmd+=['--package-dir',str(ROOT/'dist')]
  result=subprocess.run(cmd+(extra or []),capture_output=True,text=True,timeout=900)
  assert (result.returncode==0)==success, (cmd,result.returncode,result.stdout,result.stderr)
  return result
 run('minilm',success=False,directory=root/'missing');checks.append('reject non-Zotero target')
 run('minilm',success=False,extra=['--cancel-test'],online=args.online);assert not (data/'paper-nexus-models/minilm/active.json').exists();checks.append('cancel transfer without activating partial model')
 ids=','.join(m['id'] for m in config['models']);run(ids,online=args.online)
 for m in config['models']:
  manifest=m['manifest'];folder=data/'paper-nexus-models'/m['id']/manifest['version'];assert json.loads((folder.parent/'active.json').read_text(encoding='utf-8'))==manifest
  for f in manifest['files']:assert hashlib.sha256((folder/f['name']).read_bytes()).hexdigest()==f['sha256']
 checks.append('multi-select installs every selected model with exact hashes')
 xpi=downloads/config['plugin']['name'];assert hashlib.sha256(xpi.read_bytes()).hexdigest()==config['plugin']['sha256'];checks.append('bundled XPI exact match')
 m=config['models'][0];weight=data/'paper-nexus-models'/m['id']/m['manifest']['version']/'model.onnx';stamp=weight.stat().st_mtime_ns;run(ids);assert weight.stat().st_mtime_ns==stamp;checks.append('existing verified models reused without replacement')
 weight.write_bytes(b'broken');run(m['id']);assert hashlib.sha256(weight.read_bytes()).hexdigest()==next(f['sha256'] for f in m['manifest']['files'] if f['name']=='model.onnx');checks.append('damaged installation repaired')
 bad=root/'corrupt';bad.mkdir();pack=bad/m['package']['name'];pack.write_bytes(b'not a model');weight.write_bytes(b'preserve on failure');pointer=(weight.parent.parent/'active.json').read_bytes()
 # The first package-dir argument wins; use a direct command for the corruption fixture.
 result=subprocess.run([str(exe),'--quiet','--data-dir',str(data),'--download-dir',str(downloads),'--model',m['id'],'--package-dir',str(bad)],capture_output=True,timeout=120);assert result.returncode!=0;assert weight.read_bytes()==b'preserve on failure';assert (weight.parent.parent/'active.json').read_bytes()==pointer;checks.append('corrupt download leaves installed pointer and files unchanged')
 assert not list((data/'paper-nexus-models').glob('.setup-*'));checks.append('temporary installation files cleaned')
 for lang in ['zh','en']:
  subprocess.run([str(exe),'--screenshot',str(base/('installer-'+sys.platform+'-'+lang+'.png')),'--lang',lang],check=True,timeout=30)
 subprocess.run([str(exe),'--screenshot',str(base/('installer-'+sys.platform+'-progress.png')),'--lang','zh','--progress-preview'],check=True,timeout=30)
 report={'passed':True,'platform':sys.platform,'version':config['version'],'online':args.online,'checks':checks};(base/'test-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
