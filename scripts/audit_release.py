"""Validate the reviewed public Git index before publishing or packaging."""
from pathlib import Path, PurePosixPath
import json, re, subprocess

ROOT = Path(__file__).resolve().parents[1]

def check_public_path(name):
    p = PurePosixPath(name)
    assert '..' not in p.parts and not p.is_absolute() and str(p) == name and '\\' not in name, name
    assert not any(part in {'qa-profile', 'qa-library', 'test-results', 'test-fixtures', '.build', 'dist', 'node_modules', 'coverage', 'playwright-report', '.idea', '.vscode', '__pycache__'} for part in p.parts), 'Local-only file: ' + name
    assert not re.search(r'(?:^|/)(?:\.env(?:\..*)?|\.DS_Store|native-.*|VALIDATION(?:-.*)?\.md|REVIEW\.md|RESEARCH\.md|DESIGN\.md|INTERFACE\.md|NETWORK-REDESIGN\.md|TESTING\.md)$', name, re.I), 'Internal record: ' + name
    assert not re.search(r'\.(?:log(?:\..*)?|pid|prof|heapsnapshot|pem|key|sqlite\w*|db|dmp|pyc)$', name, re.I), 'Local-only artifact: ' + name

def addon_payload(root=ROOT):
    """Select only reviewed runtime files, never stray files in addon/."""
    names = json.loads((root / 'scripts/public-files.json').read_text(encoding='utf-8'))['files']
    assert len(names) == len(set(names)), 'Duplicate public-file entry'
    payload = {}
    for name in names:
        check_public_path(name)
        if not name.startswith('addon/'):
            continue
        relative = PurePosixPath(name).relative_to('addon')
        assert 'models' not in relative.parts and relative.suffix != '.wasm', 'Model binary in XPI list: ' + name
        path = root / name
        assert not any(parent.is_symlink() for parent in (path, *path.parents) if parent != root and root in parent.parents), 'Symlink in payload: ' + name
        assert path.is_file(), 'Missing runtime file: ' + name
        payload[relative.as_posix()] = path
    assert 'manifest.json' in payload and 'bootstrap.js' in payload, 'Incomplete runtime list'
    return payload

def index_bytes(name):
    return subprocess.check_output(['git', 'show', ':' + name], cwd=ROOT)

def public_index():
    names = set(filter(None, subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')))
    allowed = json.loads(index_bytes('scripts/public-files.json'))['files']
    assert len(allowed) == len(set(allowed)), 'Duplicate public-file entry'
    assert names == set(allowed), 'Public file mismatch: unexpected=' + str(sorted(names-set(allowed))) + '; missing=' + str(sorted(set(allowed)-names))
    modes = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=ROOT).decode().split('\0')
    assert not any(entry.startswith(('120000 ', '160000 ')) for entry in modes), 'Symlinks and submodules are not public payloads'
    for name in names:
        check_public_path(name)
        p = PurePosixPath(name)
        assert '..' not in p.parts and not p.is_absolute(), name
        assert not any(part in {'qa-profile','qa-library','test-results','test-fixtures','.build','dist','node_modules'} for part in p.parts), name
        if p.suffix not in {'.png','.jpg','.ttf'}:
            content = index_bytes(name).decode('utf-8')
            assert not re.search(r'/(?:Users|Volumes)/', content), 'Private path in ' + name
            assert not re.search(r'(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}', content), 'Credential-shaped value in ' + name
            assert not re.search(r'\bsk-(?:proj-|cp-)?[A-Za-z0-9_-]{24,}', content), 'API credential-shaped value in ' + name
            assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', content), 'Private key in ' + name
    return names

def audit():
    names = public_index()
    for name in names:
        if not name.endswith('.md'):
            continue
        content = index_bytes(name).decode()
        links = re.findall(r'\]\(([^)]+)\)', content) + re.findall(r'<(?:img|a)\b[^>]*?\b(?:src|href)=[\"\']([^\"\']+)', content, re.I)
        for link in links:
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
