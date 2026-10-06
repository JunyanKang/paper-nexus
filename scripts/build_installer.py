"""Build small native download/install assistants without a bundled language runtime."""
from pathlib import Path
import hashlib,json,os,plistlib,shutil,struct,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parents[1]
from installer_fonts import check as check_installer_fonts
check_installer_fonts()
version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
out=ROOT/'.build/installers';out.mkdir(parents=True,exist_ok=True)
repo='https://kanglab.cool/paper-nexus/'
def asset(path,tag):
 return {'name':path.name,'url':repo+tag+'/'+path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
catalog=json.loads((ROOT/'model-catalog.json').read_text(encoding='utf-8'))
profiles=json.loads((ROOT/'installers/models.json').read_text(encoding='utf-8'))['models']
models=[]
for profile in profiles:
 m=next(m for m in catalog['models'] if m['id']==profile['id'])
 pack=ROOT/'dist'/profile['package']['name']
 if pack.exists():
  assert pack.stat().st_size==profile['package']['bytes'] and hashlib.sha256(pack.read_bytes()).hexdigest()==profile['package']['sha256'], 'Rebuild installer model catalog'
 models.append({**profile,'manifest':m})
config={'version':version,'plugin':asset(ROOT/'dist'/f'paper-nexus-{version}.xpi','v'+version),'models':models}
(out/'installer.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
if sys.platform=='darwin':
 try:
  import dmgbuild
  from ds_store import DSStore
  from mac_alias import Alias
 except ImportError:
  raise SystemExit('Install the macOS build tools: python -m pip install -r installers/macos/requirements.txt')
 app=out/'Paper Nexus Installer.app';resources=app/'Contents/Resources';binary=app/'Contents/MacOS/Paper Nexus Installer'
 resources.mkdir(parents=True,exist_ok=True);binary.parent.mkdir(parents=True,exist_ok=True)
 (resources/'plugin.xpi').unlink(missing_ok=True)
 for arch in ['arm64','x86_64']:
  subprocess.run(['xcrun','swiftc','-O','-module-cache-path',str(out/'swift-cache'),'-target',arch+'-apple-macos12.0','-framework','Cocoa',str(ROOT/'installers/macos/Installer.swift'),'-o',str(out/('installer-'+arch))],check=True)
 subprocess.run(['lipo','-create',str(out/'installer-arm64'),str(out/'installer-x86_64'),'-output',str(binary)],check=True)
 iconset=out/'PaperNexus.iconset';iconset.mkdir(exist_ok=True)
 for size in [16,32,128,256,512]:
  for factor in [1,2]:
   subprocess.run(['sips','-z',str(size*factor),str(size*factor),str(ROOT/'addon/assets/nexus.png'),'--out',str(iconset/f'icon_{size}x{size}{"@2x" if factor==2 else ""}.png')],check=True,stdout=subprocess.DEVNULL)
 chunks=b''
 for kind,name in [('icp4','icon_16x16.png'),('icp5','icon_32x32.png'),('icp6','icon_32x32@2x.png'),('ic07','icon_128x128.png'),('ic08','icon_256x256.png'),('ic09','icon_512x512.png'),('ic10','icon_512x512@2x.png')]:
  payload=(iconset/name).read_bytes();chunks+=kind.encode()+struct.pack('>I',len(payload)+8)+payload
 (resources/'PaperNexus.icns').write_bytes(b'icns'+struct.pack('>I',len(chunks)+8)+chunks)
 for source,name in [(out/'installer.json','installer.json'),(ROOT/'addon/assets/nexus.png','nexus.png'),(ROOT/'LICENSE','LICENSE')]:shutil.copyfile(source,resources/name)
 for source in (ROOT/'installers/assets').glob('*'):
  if source.suffix in ['.ttf','.txt']:shutil.copyfile(source,resources/source.name)
 info={'CFBundleIdentifier':'io.github.junyankang.paper-nexus.installer','CFBundleName':'Paper Nexus Installer','CFBundleDisplayName':'Paper Nexus 安装助手','CFBundleExecutable':binary.name,'CFBundleVersion':version,'CFBundleShortVersionString':version,'CFBundlePackageType':'APPL','CFBundleIconFile':'PaperNexus','LSMinimumSystemVersion':'12.0','NSHighResolutionCapable':True}
 (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
 renderer=out/'render-dmg-background'
 subprocess.run(['xcrun','swiftc','-O','-module-cache-path',str(out/'swift-cache'),'-framework','Cocoa',str(ROOT/'installers/macos/DMGBackground.swift'),'-o',str(renderer)],check=True)
 subprocess.run([str(renderer),str(out)],check=True)
 background=resources/'dmg-background.tiff'
 subprocess.run(['tiffutil','-cathidpicheck',str(out/'dmg-background.png'),str(out/'dmg-background@2x.png'),'-out',str(background)],check=True)
 subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
 # An override allows local previews without replacing a release artifact.
 target=Path(os.environ.get('PAPER_NEXUS_DMG_OUTPUT',str(ROOT/'dist'/f'Paper-Nexus-{version}-macOS.dmg'))).resolve()
 target.parent.mkdir(parents=True,exist_ok=True)
 # Keep the background inside the signed app so even Finder's "show hidden
 # files" mode cannot add a distracting background-file icon beside the app.
 image_mount={}
 def capture_mount(path,options):image_mount['path']=Path(path)
 def configure_background(event):
  if event.get('type')=='operation::finished' and event.get('operation')=='dsstore::create':
   mount=image_mount['path']
   with DSStore.open(str(mount/'.DS_Store'),'r+') as store:
    icon_view=store['.']['icvp']
    icon_view['backgroundType']=2
    icon_view['backgroundImageAlias']=Alias.for_file(str(mount/app.name/'Contents/Resources/dmg-background.tiff')).to_bytes()
    store['.']['icvp']=icon_view
 dmgbuild.build_dmg(str(target),'Paper Nexus',callback=configure_background,settings={
  'format':'UDZO','files':[str(app)],'create_hook':capture_mount,
  'window_rect':((140,40),(760,700)),'icon_size':88,'text_size':14,
  'icon_locations':{app.name:(380,150)},
  'default_view':'icon-view','include_icon_view_settings':True,'include_list_view_settings':False,
  'show_status_bar':False,'show_tab_view':False,'show_toolbar':False,
  'show_pathbar':False,'show_sidebar':False,'arrange_by':None,
 })
 subprocess.run(['hdiutil','verify',str(target)],check=True)
 print(target)
elif sys.platform=='win32':
 subprocess.run(['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'installers/windows/build.ps1'),'-Root',str(ROOT)],check=True)
 csc=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 exe=out/'Paper Nexus Setup.exe'
 subprocess.run([str(csc),'/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',*[f'/reference:{lib}.dll' for lib in ['System.Windows.Forms','System.Drawing','System.Core','System.Net.Http','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem']],f'/win32icon:{out / "PaperNexus.ico"}',f'/win32manifest:{ROOT / "installers/windows/app.manifest"}',f'/resource:{ROOT / "addon/assets/nexus.png"},nexus.png',f'/resource:{out / "installer.json"},installer.json',*[f'/resource:{source},{source.name}' for source in sorted((ROOT/'installers/assets').glob('*')) if source.suffix in ['.ttf','.txt']],f'/out:{exe}',str(ROOT/'installers/windows/Installer.cs')],check=True)
 target=ROOT/'dist'/f'Paper-Nexus-{version}-Windows.exe'
 shutil.copyfile(exe,target)
 print(target)
else:raise SystemExit('Build native assistants on macOS or Windows.')
