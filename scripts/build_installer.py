"""Build small native download/install assistants without a bundled language runtime."""
from pathlib import Path
import hashlib,json,os,plistlib,shutil,struct,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
out=ROOT/'.build/installers';out.mkdir(parents=True,exist_ok=True)
repo='https://github.com/JunyanKang/paper-nexus/releases/download/'
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
 app=out/'Paper Nexus Installer.app';resources=app/'Contents/Resources';binary=app/'Contents/MacOS/Paper Nexus Installer'
 resources.mkdir(parents=True,exist_ok=True);binary.parent.mkdir(parents=True,exist_ok=True)
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
 for source,name in [(out/'installer.json','installer.json'),(ROOT/'addon/assets/nexus.png','nexus.png'),(ROOT/'LICENSE','LICENSE'),(ROOT/'dist'/config['plugin']['name'],'plugin.xpi')]:shutil.copyfile(source,resources/name)
 for source in (ROOT/'installers/assets').glob('*'):
  if source.suffix in ['.ttf','.txt']:shutil.copyfile(source,resources/source.name)
 info={'CFBundleIdentifier':'io.github.junyankang.paper-nexus.installer','CFBundleName':'Paper Nexus Installer','CFBundleDisplayName':'Paper Nexus 安装助手','CFBundleExecutable':binary.name,'CFBundleVersion':version,'CFBundleShortVersionString':version,'CFBundlePackageType':'APPL','CFBundleIconFile':'PaperNexus','LSMinimumSystemVersion':'12.0','NSHighResolutionCapable':True}
 (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
 subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
 target=ROOT/'dist'/f'Paper-Nexus-{version}-macOS.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(app.rglob('*')):
   if p.is_file():z.write(p,app.name+'/'+p.relative_to(app).as_posix())
 print(target)
elif sys.platform=='win32':
 subprocess.run(['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'installers/windows/build.ps1'),'-Root',str(ROOT)],check=True)
 csc=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 exe=out/'Paper Nexus Setup.exe'
 subprocess.run([str(csc),'/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',*[f'/reference:{lib}.dll' for lib in ['System.Windows.Forms','System.Drawing','System.Core','System.Net.Http','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem']],f'/win32icon:{out / "PaperNexus.ico"}',f'/win32manifest:{ROOT / "installers/windows/app.manifest"}',f'/resource:{ROOT / "addon/assets/nexus.png"},nexus.png',f'/resource:{out / "installer.json"},installer.json',f'/resource:{ROOT / "dist" / config["plugin"]["name"]},plugin.xpi',*[f'/resource:{source},{source.name}' for source in sorted((ROOT/'installers/assets').glob('*')) if source.suffix in ['.ttf','.txt']],f'/out:{exe}',str(ROOT/'installers/windows/Installer.cs')],check=True)
 target=ROOT/'dist'/f'Paper-Nexus-{version}-Windows.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:z.write(exe,exe.name)
 print(target)
else:raise SystemExit('Build native assistants on macOS or Windows.')
