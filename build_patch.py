"""Create an offline ZIP from a complete PyInstaller release (never include user data)."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import os
import zipfile
from patch_updates import APP_VERSION, REQUIRED, MAX_UNPACKED, MAX_ZIP, safe_name, version
from maintenance import no_links


def build(bundle, output, minimum='2.1.0', notes=''):
    bundle, output = Path(bundle).resolve(), Path(output).resolve()
    if output.is_relative_to(bundle): raise ValueError('Write the patch outside the release folder')
    no_links(bundle)
    release = json.loads((bundle/'release.json').read_text(encoding='utf-8'))
    version(release['version']); version(minimum)
    files = {}
    total = 0
    for path in sorted(bundle.rglob('*')):
        if not path.is_file(): continue
        name = path.relative_to(bundle).as_posix()
        if name.split('/')[0].lower() in {'data','.git','.settings-backups'} or name in {'patch.json','update-result.json','UPDATE-INCOMPLETE.txt'}: continue
        safe_name(name)
        total += path.stat().st_size
        files[name] = sha256(path.read_bytes()).hexdigest()
    if not REQUIRED.issubset(files) or total > MAX_UNPACKED: raise ValueError('Release incomplete or too large')
    manifest = dict(application='PBudgetManager', format=1, version=release['version'], minimumVersion=minimum, notes=notes, files=files)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('patch.json', json.dumps(manifest, ensure_ascii=False, indent=2))
            for name in files: z.write(bundle/name, name)
        if temporary.stat().st_size > MAX_ZIP: raise ValueError('Compressed patch too large')
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return output


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle'); parser.add_argument('output')
    parser.add_argument('--minimum', default=APP_VERSION); parser.add_argument('--notes', default='')
    args=parser.parse_args()
    print(build(args.bundle,args.output,args.minimum,args.notes))
