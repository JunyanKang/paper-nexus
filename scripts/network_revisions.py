"""Content-derived network revisions, embedded in every production and QA XPI."""
import hashlib,json
from pathlib import Path

def revisions(root=None):
    root=root or Path(__file__).resolve().parents[1]
    groups={
        'references':['core.js','bibliography.js','citation-links.js'],
        'authors':['network.js','core.js','authors.js','network-core.js','network-map.js','network-view.js'],
        'abstracts':['core.js','authors.js','abstracts.js'],
        'input':['core.js','network-core.js'],
        'snapshot':['core.js','network-core.js'],
    }
    values={}
    for name,files in groups.items():
        h=hashlib.sha256()
        for file in files:
            h.update(file.encode()+b'\0');h.update((root/'addon'/file).read_bytes())
        values[name]=h.hexdigest()
    return json.dumps({'schema':1,**values},sort_keys=True,separators=(',',':')).encode()


def revision_script(root=None):
    # Packaged trusted data loaded directly, without Zotero HTTP's unsupported jar URI path.
    return b'var PaperNexusNetworkRevisions = ' + revisions(root) + b';\n'
