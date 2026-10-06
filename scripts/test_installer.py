"""Exercise native installers against disposable data directories, never a user profile."""
from pathlib import Path
import json,subprocess,sys,tempfile,hashlib,shutil,argparse,plistlib,os
ROOT=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--online',action='store_true');parser.add_argument('--published',action='store_true');args=parser.parse_args()
base=ROOT/'.build/installers';config=json.loads((base/'installer.json').read_text(encoding='utf-8'))
exe=base/'Paper Nexus Installer.app/Contents/MacOS/Paper Nexus Installer' if sys.platform=='darwin' else base/'Paper Nexus Setup.exe'
checks=[]
if sys.platform=='darwin':
 from ds_store import DSStore
 from mac_alias import Alias
 image=Path(os.environ.get('PAPER_NEXUS_DMG_OUTPUT',str(ROOT/'dist'/f"Paper-Nexus-{config['version']}-macOS.dmg")))
 mounted=plistlib.loads(subprocess.check_output(['hdiutil','attach','-readonly','-nobrowse','-plist',str(image)]))
 mount=Path(next(row['mount-point'] for row in mounted['system-entities'] if 'mount-point' in row))
 try:
  app=mount/'Paper Nexus Installer.app'
  assert [p.name for p in mount.iterdir() if not p.name.startswith('.')]==[app.name]
  assert not (mount/'.background.tiff').exists()
  with DSStore.open(str(mount/'.DS_Store'),'r') as store:
   view=store['.']['icvp'];alias=Alias.from_bytes(view['backgroundImageAlias'])
   assert view['backgroundType']==2 and alias.target.filename=='dmg-background.tiff'
   assert str(alias.target.posix_path).endswith('/Contents/Resources/dmg-background.tiff')
   assert store[app.name]['Iloc']==(380,150) and store['.']['icvl']==(b'type',b'icnv')
  subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
  checks.append('DMG has one visible app, a valid signature and an embedded Finder help background')
  with tempfile.TemporaryDirectory(prefix='nexus-mounted-') as scratch:
   subprocess.run([str(app/'Contents/MacOS/Paper Nexus Installer'),'--quiet','--plugin-only','--download-dir',scratch,'--plugin-dir',str(ROOT/'dist')],check=True,capture_output=True,timeout=120)
   assert hashlib.sha256((Path(scratch)/config['plugin']['name']).read_bytes()).hexdigest()==config['plugin']['sha256']
  checks.append('installer runs directly from read-only DMG and prepares the exact XPI')
 finally:subprocess.run(['hdiutil','detach',str(mount)],check=True,stdout=subprocess.DEVNULL)
with tempfile.TemporaryDirectory(prefix='nexus-selection-') as scratch:
 result=Path(scratch)/'selection.json'
 subprocess.run([str(exe),'--selection-check',str(result)],check=True,timeout=30)
 selection=json.loads(result.read_text());assert selection and all(selection.values()), selection
 checks.append('real checkbox clicks and text refresh preserve zero, single and multiple selections')
 for model in config['models']:
  root=Path(scratch)/model['id'];data=root/'data';data.mkdir(parents=True);(data/'zotero.sqlite').write_text('fixture');downloads=root/'downloads'
  subprocess.run([str(exe),'--quiet','--data-dir',str(data),'--download-dir',str(downloads),'--model',model['id'],'--package-dir',str(ROOT/'dist')],check=True,capture_output=True,timeout=120)
  active=list((data/'paper-nexus-models').glob('*/active.json'))
  assert len(active)==1 and active[0].parent.name==model['id']
  assert {p.name for p in downloads.glob('*.pnmodel')}=={model['package']['name']}
 checks.append('each single-model selection installs and downloads only that model')
with tempfile.TemporaryDirectory(prefix='nexus-installer-') as scratch:
 root=Path(scratch);data=root/'data';data.mkdir();(data/'zotero.sqlite').write_text('installer test marker, not a real library');downloads=root/'plugins'
 def run(ids='minilm',success=True,extra=None,directory=data,online=False):
  cmd=[str(exe),'--quiet','--data-dir',str(directory),'--download-dir',str(downloads),'--model',ids]
  if not online:cmd+=['--package-dir',str(ROOT/'dist')]
  elif not args.published:cmd+=['--plugin-dir',str(ROOT/'dist')]
  result=subprocess.run(cmd+(extra or []),capture_output=True,text=True,timeout=900)
  assert (result.returncode==0)==success, (cmd,result.returncode,result.stdout,result.stderr)
  return result
 run('minilm',success=False,directory=root/'missing');checks.append('reject non-Zotero target')
 run('minilm',success=False,extra=['--cancel-test'],online=args.online);assert not (data/'paper-nexus-models/minilm/active.json').exists();checks.append('cancel transfer without activating partial model')
 # Plugin-only download must work without a Zotero directory or a selected model.
 standalone=root/'plugin-only'
 def plugin_only(folder=standalone,source=ROOT/'dist',extra=()):
  return subprocess.run([str(exe),'--quiet','--plugin-only','--download-dir',str(folder),'--plugin-dir',str(source),*extra],capture_output=True,timeout=120)
 assert plugin_only().returncode==0
 plugin=standalone/config['plugin']['name'];assert hashlib.sha256(plugin.read_bytes()).hexdigest()==config['plugin']['sha256'];checks.append('standalone XPI download needs no Zotero library or model')
 stamp=plugin.stat().st_mtime_ns;assert plugin_only().returncode==0 and plugin.stat().st_mtime_ns==stamp;checks.append('standalone verified XPI is reused')
 cancelled=root/'cancelled-plugin';assert plugin_only(cancelled,extra=['--cancel-test']).returncode!=0;assert not list(cancelled.iterdir());checks.append('cancelled standalone XPI leaves no partial files')
 corrupt=root/'corrupt-plugin';corrupt.mkdir();(corrupt/config['plugin']['name']).write_bytes(b'corrupt')
 rejected=root/'rejected-plugin';assert plugin_only(rejected,corrupt).returncode!=0;assert not list(rejected.iterdir());checks.append('standalone corrupted XPI cannot be installed')
 assert plugin_only(standalone,corrupt).returncode==0 and hashlib.sha256(plugin.read_bytes()).hexdigest()==config['plugin']['sha256'];checks.append('valid cached XPI survives an invalid alternate source')
 ids=','.join(m['id'] for m in config['models']);run(ids,online=args.online)
 for m in config['models']:
  manifest=m['manifest'];folder=data/'paper-nexus-models'/m['id']/manifest['version'];assert json.loads((folder.parent/'active.json').read_text(encoding='utf-8'))==manifest
  for f in manifest['files']:assert hashlib.sha256((folder/f['name']).read_bytes()).hexdigest()==f['sha256']
 checks.append('multi-select installs every selected model with exact hashes')
 xpi=downloads/config['plugin']['name'];assert hashlib.sha256(xpi.read_bytes()).hexdigest()==config['plugin']['sha256'];checks.append('downloaded XPI exact match')
 m=config['models'][0];weight=data/'paper-nexus-models'/m['id']/m['manifest']['version']/'model.onnx';stamp=weight.stat().st_mtime_ns;run(ids);assert weight.stat().st_mtime_ns==stamp;checks.append('existing verified models reused without replacement')
 weight.write_bytes(b'broken');run(m['id']);assert hashlib.sha256(weight.read_bytes()).hexdigest()==next(f['sha256'] for f in m['manifest']['files'] if f['name']=='model.onnx');checks.append('damaged installation repaired')
 (downloads/m['package']['name']).unlink();bad=root/'corrupt';bad.mkdir();pack=bad/m['package']['name'];pack.write_bytes(b'not a model');weight.write_bytes(b'preserve on failure');pointer=(weight.parent.parent/'active.json').read_bytes()
 # The first package-dir argument wins; use a direct command for the corruption fixture.
 result=subprocess.run([str(exe),'--quiet','--data-dir',str(data),'--download-dir',str(downloads),'--model',m['id'],'--package-dir',str(bad)],capture_output=True,timeout=120);assert result.returncode!=0;assert weight.read_bytes()==b'preserve on failure';assert (weight.parent.parent/'active.json').read_bytes()==pointer;checks.append('corrupt download leaves installed pointer and files unchanged')
 assert not list((data/'paper-nexus-models').glob('.setup-*'));checks.append('temporary installation files cleaned')
 custom=root/'Custom models';custom.mkdir();run(ids,extra=['--model-dir',str(custom)]);location=json.loads((data/'paper-nexus-model-location.json').read_text());assert Path(location['root']).resolve()==custom.resolve();assert all((custom/m['id']/'active.json').exists() for m in config['models']);checks.append('custom directory publishes discoverable location after verified install')
 run(ids);assert json.loads((data/'paper-nexus-model-location.json').read_text())==location;checks.append('later install follows saved model directory')
 run(ids,success=False,extra=['--model-dir',str(root/'does-not-exist')]);assert not (root/'does-not-exist').exists();assert json.loads((data/'paper-nexus-model-location.json').read_text())==location;checks.append('reject nonexistent custom directory without changing location')
 # Invalid XPI must not replace a previously valid downloaded plugin.
 broken=root/'broken-plugin';broken.mkdir();(broken/config['plugin']['name']).write_bytes(b'invalid');fresh=root/'fresh-plugins'
 result=subprocess.run([str(exe),'--quiet','--data-dir',str(data),'--download-dir',str(fresh),'--model',m['id'],'--package-dir',str(broken)],capture_output=True,timeout=120);assert result.returncode!=0 and not (fresh/config['plugin']['name']).exists();checks.append('invalid plugin download never promoted')
 for lang in ['zh','en']:
  subprocess.run([str(exe),'--screenshot',str(base/('installer-'+sys.platform+'-'+lang+'.png')),'--lang',lang],check=True,timeout=30)
 subprocess.run([str(exe),'--screenshot',str(base/('installer-'+sys.platform+'-progress.png')),'--lang','zh','--progress-preview'],check=True,timeout=30)
 report={'passed':True,'platform':sys.platform,'version':config['version'],'online':args.online,'checks':checks};(base/'test-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
