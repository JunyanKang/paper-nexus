"""Content-derived network revisions, embedded in every production and QA XPI."""
import hashlib,json
from pathlib import Path

def revisions(root=None):
    root=root or Path(__file__).resolve().parents[1]
    groups={
        'topics':['network.js','core.js','network-core.js','network-map.js','semantic-core.js','topic-concepts.js','topic-lexicon.js','semantic-kernel.js','network-view.js'],
        'authors':['network.js','core.js','authors.js','network-core.js','network-map.js','semantic-core.js','network-view.js'],
        'abstracts':['network.js','core.js','authors.js','abstracts.js'],
        'input':['core.js','semantic.js','semantic-core.js','semantic-worker.js'],
        'enhancement':['network-enhancement.js','network-core.js','core.js','abstracts.js','authors.js'],
        'snapshot':['core.js','network-core.js'],
    }
    values={}
    for name,files in groups.items():
        h=hashlib.sha256()
        for file in files:
            h.update(file.encode()+b'\0');h.update((root/'addon'/file).read_bytes())
        values[name]=h.hexdigest()
    return json.dumps({'schema':1,**values},sort_keys=True,separators=(',',':')).encode()
