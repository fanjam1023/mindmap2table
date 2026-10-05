"""Package only the six installable files; keep local research out of releases."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / '.mnaddon-work'
manifest = json.loads((source / 'mnaddon.json').read_text())
files = ['alipay.jpg', 'icon.png', 'logo.png', 'main.js', 'mnaddon.json', 'wechat.jpg']
for name in files:
    if not (source / name).is_file():
        raise FileNotFoundError(name)
output = root / 'dist' / ('mindmap2table-v' + manifest['version'] + '.mnaddon')
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(source / name, name)
with zipfile.ZipFile(output) as archive:
    assert sorted(archive.namelist()) == sorted(files)
    for name in files:
        assert archive.read(name) == (source / name).read_bytes()
print(output.name)
