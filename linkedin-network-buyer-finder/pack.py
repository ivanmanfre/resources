#!/usr/bin/env python3
"""Package editable kit plus local browser files. Run again after UI integration."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent
DESCRIPTIONS = {
    'README.md': 'Start here: contents, workflow and limits.',
    'SETUP.md': 'Open the local tool and prepare an authorized export.',
    'AGENTS.md': 'Local assistant instructions with source-data boundaries.',
    'ICP-worksheet.md': 'Define observable buyer criteria and missing facts.',
    'buyer-criteria.json': 'Editable example role, business, exclusion and location phrases.',
    'connections-template.csv': 'Native connection headers and optional supplied context.',
    'fictional-practice.csv': 'Eight invented data rows for a hand-checkable practice run.',
    'expected-decisions.md': 'Expected practice classifications and reconciled counts.',
    'review-playbook.md': 'Decision rules, duplicate identity and suppression handling.',
    'usage-and-review-guide.md': 'Manual review, export audit and practical limits.',
    'prompts/ambiguous-record-review.md': 'Optional draft review prompt with untrusted-source boundary.',
    'run-review.cjs': 'Dependency-free local Node runner for CSV audit exports.',
}
kit_files = sorted(path for path in (ROOT / 'kit').rglob('*') if path.is_file())
data = {
    'name': 'LinkedIn Network Buyer Finder',
    'defaults': json.loads((ROOT / 'kit/buyer-criteria.json').read_text()),
    'demoCsv': (ROOT / 'kit/fictional-practice.csv').read_text(),
    'files': [
        {'path': path.relative_to(ROOT).as_posix(),
         'description': DESCRIPTIONS.get(path.relative_to(ROOT / 'kit').as_posix(), 'Editable kit file.'),
         'content': path.read_text()}
        for path in kit_files
    ],
}
encoded = json.dumps(data, ensure_ascii=False, indent=2)
(ROOT / 'data.json').write_text(encoded + '\n')
# The script node is an explicit integration point; other UI content is preserved.
index = ROOT / 'index.html'
if index.exists():
    html = index.read_text()
    pattern = re.compile(r'(<script\b[^>]*\bid=["\']kit-data["\'][^>]*>)[\s\S]*?(</script>)', re.I)
    matches = list(pattern.finditer(html))
    if len(matches) > 1:
        raise ValueError('Multiple kit-data script elements found; refusing to alter the UI.')
    if matches:
        safe = encoded.replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
        html = pattern.sub(lambda match: match.group(1) + '\n' + safe + '\n' + match.group(2), html)
        index.write_text(html)

root_names = ['index.html', 'style.css', 'app.js', 'core.js', 'core.test.cjs', 'pack.py', 'data.json']
files = [ROOT / name for name in root_names if (ROOT / name).is_file()]
files += kit_files
files += sorted(path for path in (ROOT / 'assets').rglob('*') if path.is_file() and path.suffix.lower() in {'.svg','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ttf','.otf'})
files = sorted(set(files), key=lambda path: path.relative_to(ROOT).as_posix())
manifest = {
    'name': data['name'],
    'version': '2026-09-30',
    'fictionalPracticeRows': 8,
    'kitFileCount': len(kit_files),
    'fileCount': len(files),
    'files': [{'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size,
               'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in files],
    'manifestNote': 'This manifest lists all archive payload files except manifest.json itself. The ZIP is not nested inside its own payload.',
}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
archive = ROOT / 'assets/linkedin-network-buyer-finder.zip'
archive.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for path in files + [ROOT / 'manifest.json']:
        info = zipfile.ZipInfo('linkedin-network-buyer-finder/' + path.relative_to(ROOT).as_posix(), date_time=(2026,9,30,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        output.writestr(info, path.read_bytes())
print(json.dumps({'kitFiles':len(kit_files),'payloadFiles':len(files),'archiveEntries':len(files)+1,'archive':str(archive),'bytes':archive.stat().st_size}))
