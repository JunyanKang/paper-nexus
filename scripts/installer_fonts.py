"""Check bundled UI glyphs before packaging; optionally rebuild from the pinned Noto source."""
from pathlib import Path
import argparse, hashlib, struct

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da'
FACES = [(400, 'Regular'), (600, 'SemiBold')]


def ui_text():
    paths = ['installers/macos/Installer.swift', 'installers/windows/Installer.cs', 'installers/models.json']
    return ''.join((ROOT / p).read_text(encoding='utf-8') for p in paths) + ''.join(chr(i) for i in range(32, 127))


def covered(data, wanted):
    """Read Unicode cmap formats 4 and 12 without adding a packaging dependency."""
    u16 = lambda pos: struct.unpack_from('>H', data, pos)[0]
    u32 = lambda pos: struct.unpack_from('>I', data, pos)[0]
    tables = {data[p:p+4]: u32(p+8) for p in range(12, 12+16*u16(4), 16)}
    cmap = tables[b'cmap']
    found = set()
    for p in range(cmap+4, cmap+4+8*u16(cmap+2), 8):
        platform, encoding = u16(p), u16(p+2)
        if platform != 0 and (platform != 3 or encoding not in (1, 10)):
            continue
        sub = cmap + u32(p+4)
        fmt = u16(sub)
        if fmt == 12:
            for row in range(sub+16, sub+16+12*u32(sub+12), 12):
                first, last, glyph = struct.unpack_from('>III', data, row)
                found.update(c for c in wanted if first <= c <= last and glyph+c-first != 0)
        elif fmt == 4:
            count = u16(sub+6)//2
            end, start = sub+14, sub+16+2*count
            delta, offsets = start+2*count, start+4*count
            for i in range(count):
                low, high = u16(start+2*i), u16(end+2*i)
                for c in wanted:
                    if not low <= c <= high:
                        continue
                    shift, relative = u16(delta+2*i), u16(offsets+2*i)
                    glyph = u16(offsets+2*i+relative+2*(c-low)) if relative else c
                    if relative and glyph == 0:
                        continue
                    if (glyph+shift) % 65536:
                        found.add(c)
    return found


def check():
    required = {ord(c) for c in ui_text() if ord(c) >= 32 and not c.isspace()}
    for _, style in FACES:
        path = ROOT / 'installers/assets' / ('NexusSans-'+style+'.ttf')
        missing = required-covered(path.read_bytes(), required)
        if missing:
            raise SystemExit(path.name+' missing UI glyphs: '+''.join(chr(c) for c in sorted(missing)))
    print('Installer fonts cover all current UI characters in both weights')


def rebuild(source):
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit('Use the pinned Noto Sans SC source listed in FONT-NOTICE.md')
    # Optional regeneration tools; users and normal builds do not need fontTools.
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools import subset
    for weight, style in FACES:
        font = instantiateVariableFont(TTFont(source), {'wght': weight}, inplace=True)
        options = subset.Options()
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
        options.recalc_bounds = True
        cutter = subset.Subsetter(options=options)
        cutter.populate(text=ui_text())
        cutter.subset(font)
        names = {1: 'Nexus Sans', 2: 'Bold' if weight == 600 else style,
                 3: 'Nexus Sans '+style, 4: 'Nexus Sans '+style, 6: 'NexusSans-'+style}
        for record in font['name'].names:
            if record.nameID in names:
                record.string = names[record.nameID].encode(record.getEncoding())
        if weight == 600:
            font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~(1 << 6)) | (1 << 5)
            font['head'].macStyle |= 1
        font.save(ROOT / 'installers/assets' / ('NexusSans-'+style+'.ttf'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Rebuild from the verified source TTF (requires fontTools)')
    args = parser.parse_args()
    if args.source:
        rebuild(args.source)
    check()
