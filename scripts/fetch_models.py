"""Fetch pinned public model assets and verify hashes. Never reads personal data."""
from pathlib import Path
import hashlib,json,urllib.request,time
ROOT=Path(__file__).resolve().parents[1]
def ensure_assets():
 for entry in json.loads((ROOT/'scripts/model-assets.json').read_text())['files']:
  path=ROOT/entry['path'];expected=entry['sha256']
  if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==expected:continue
  path.parent.mkdir(parents=True,exist_ok=True)
  for attempt in range(3):
   try:
    with urllib.request.urlopen(entry['url'],timeout=90) as response:blob=response.read(entry['bytes']+1)
    assert len(blob)==entry['bytes'] and hashlib.sha256(blob).hexdigest()==expected,'Public model asset integrity mismatch'
    path.write_bytes(blob);break
   except Exception:
    if attempt==2:raise
    time.sleep(1+attempt)
if __name__=='__main__':ensure_assets();print('Pinned local model assets ready')
