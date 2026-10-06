"""Stage only verified plugin and model downloads for the dedicated Pages branch."""
from pathlib import Path
import argparse,hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('destination',type=Path);args=parser.parse_args()
version=json.loads((root/'package.json').read_text())['version'];dest=args.destination.resolve();dest.mkdir(parents=True,exist_ok=True)
manifest=json.loads((root/'dist/updates.json').read_text());plugin=manifest['addons']['cite-lens@local.research']['updates'][0]
xpi=root/'dist'/f'paper-nexus-{version}.xpi'
assert plugin['version']==version and plugin['update_hash']=='sha512:'+hashlib.sha512(xpi.read_bytes()).hexdigest()
def copy(source,relative,immutable=True):
 target=dest/relative;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists() and immutable:assert target.read_bytes()==source.read_bytes(), 'Versioned downloads are immutable: '+str(relative)
 shutil.copyfile(source,target)
copy(xpi,Path('v'+version)/xpi.name)
for row in json.loads((root/'addon/model-packages.json').read_text())['models']:
 p=root/'dist'/row['name'];assert p.stat().st_size==row['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'];copy(p,Path('models')/('v'+row['version'])/p.name)
copy(root/'dist/updates.json',Path('updates.json'),immutable=False)
(dest/'.nojekyll').touch()
print('Staged versioned plugin, verified models, and update manifest. Release assets remain DMG and EXE only.')
