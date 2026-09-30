"""Package the canonical kit files and embed the same content in the page."""
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SLUG = ROOT.name
DESCRIPTIONS = {
    'README.md': 'Start here and see the whole kit.',
    'SETUP.md': 'Run the kit in Codex or use a copied prompt.',
    'AGENTS.md': 'Workspace instructions and task routing.',
    'ROUTINE.md': 'The morning queue and weekly review.',
    'context/agency-offer.md': 'Your service, buyer criteria and approved claims.',
    'context/prospects.csv': 'Account identifiers, source labels and contact status.',
    'context/source-notes.md': 'Source excerpts, dates and unresolved questions.',
    'context/campaign.csv': 'Unique-account counts for one reporting window.',
    'playbooks/account-research.md': 'A sourced account brief with unknowns preserved.',
    'playbooks/prospect-fit.md': 'An evidence-based fit decision.',
    'playbooks/message-drafts.md': 'An opening message and one follow-up.',
    'playbooks/reply-triage.md': 'Reply categories, opt-outs and next actions.',
    'playbooks/campaign-review.md': 'Campaign reconciliation and rates with arithmetic.',
    'examples/practice-input.md': 'A fictional practice account, replies and campaign.',
    'examples/expected-output.md': 'Illustrative output guide for the practice case.',
    'outputs/README.md': 'Where to save your own documents.',
}
TASKS = [('research', 'Account research', 'account-research'), ('fit', 'Prospect fit', 'prospect-fit'), ('messages', 'Message drafts', 'message-drafts'), ('replies', 'Reply triage', 'reply-triage'), ('review', 'Campaign review', 'campaign-review')]

def main():
    files = [{'path': p, 'description': d, 'content': (ROOT / 'kit' / p).read_text()} for p, d in DESCRIPTIONS.items()]
    practice = (ROOT / 'kit/examples/practice-input.md').read_text()
    offer = practice.split('## Agency offer\n\n', 1)[1].split('## Account A', 1)[0].strip()
    source = 'Fictional practice case. Use the supplied excerpts without browsing.\n\n## Account A' + practice.split('## Account A', 1)[1]
    data = {'slug': SLUG, 'title': 'GPT-6.1 Sol outbound kit for agency founders', 'model': 'gpt-6.1-sol', 'files': files, 'tasks': [{'id': i, 'name': n, 'content': (ROOT / 'kit/playbooks' / (p + '.md')).read_text()} for i, n, p in TASKS], 'demoOffer': offer, 'demoSource': source}
    (ROOT / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    assets = ROOT / 'assets'; assets.mkdir(exist_ok=True)
    with zipfile.ZipFile(assets / (SLUG + '.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
        for f in files:
            info = zipfile.ZipInfo(SLUG + '/' + f['path'], date_time=(2026, 9, 30, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, f['content'].encode())
    manifest = {'model': data['model'], 'playbooks': len(TASKS), 'file_count': len(files), 'files': [{'path': f['path'], 'sha256': hashlib.sha256(f['content'].encode()).hexdigest()} for f in files]}
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    embedded = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('&', '\\u0026').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    page = ROOT / 'index.html'; html = page.read_text()
    html, count = re.subn(r'(<script id="kit-data" type="application/json">).*?(</script>)', lambda m: m.group(1) + embedded + m.group(2), html, flags=re.S)
    assert count == 1
    page.write_text(html)
    print(f'Packed {len(files)} files, {len(TASKS)} playbooks and synchronized the file browser.')

if __name__ == '__main__': main()
