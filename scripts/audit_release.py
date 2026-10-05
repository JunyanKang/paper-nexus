"""Validate the reviewed public Git index before publishing or packaging."""
from pathlib import Path, PurePosixPath
import json, re, subprocess

ROOT = Path(__file__).resolve().parents[1]

def index_bytes(name):
    return subprocess.check_output(['git', 'show', ':' + name], cwd=ROOT)

def public_index():
    names = set(filter(None, subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')))
    allowed = json.loads(index_bytes('scripts/public-files.json'))['files']
    assert len(allowed) == len(set(allowed)), 'Duplicate public-file entry'
    assert names == set(allowed), 'Public file mismatch: unexpected=' + str(sorted(names-set(allowed))) + '; missing=' + str(sorted(set(allowed)-names))
    for name in names:
        p = PurePosixPath(name)
        assert '..' not in p.parts and not p.is_absolute(), name
        assert not any(part in {'qa-profile','qa-library','test-results','test-fixtures','.build','dist','node_modules'} for part in p.parts), name
        if p.suffix not in {'.png','.jpg'}:
            content = index_bytes(name).decode('utf-8')
            assert not re.search(r'/(?:Users|Volumes)/', content), 'Private path in ' + name
            assert not re.search(r'(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}', content), 'Credential-shaped value in ' + name
            assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', content), 'Private key in ' + name
    return names

def audit():
    names = public_index()
    for name in names:
        if not name.endswith('.md'):
            continue
        for link in re.findall(r'\]\(([^)]+)\)', index_bytes(name).decode()):
            if re.match(r'^(?:[a-z]+:|#)', link, re.I):
                continue
            target = link.split('#')[0].split(' ')[0]
            if target:
                # Normalize relative links without requiring the target on disk.
                import posixpath
                resolved = posixpath.normpath(str(PurePosixPath(name).parent / target))
                assert resolved in names, 'Unpublished link in ' + name + ': ' + link
    print('Public source audit passed:', len(names), 'reviewed files')

if __name__ == '__main__':
    audit()
