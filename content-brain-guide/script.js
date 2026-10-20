let reader = {};
try { reader = JSON.parse(localStorage.getItem('ivan.reader') || '{}') || {}; } catch { /* Storage is optional. */ }
if (!reader.session_id) {
  reader.session_id = 's_' + crypto.randomUUID();
  try { localStorage.setItem('ivan.reader', JSON.stringify(reader)); } catch { /* Use an in-memory session. */ }
}
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const editSteps = {
  opening: { number: '01', title: 'Lead with something you did.', description: "The research found a positive association for author-voiced openings in automation. Here, the rewrite brings the author's own build into the first line.", origin: 'Research-informed opening' },
  body: { number: '02', title: 'Make the workflow easy to follow.', description: 'The rewrite separates the three actions already in the draft. Readers can see what the workflow does. This formatting is a writing choice made by ChatGPT.', origin: 'Editorial choice' },
  payoff: { number: '03', title: 'Show what the finished workflow gives you.', description: 'The summary becomes a concrete outcome: seeing what sold in one email. The rewrite keeps the original scope and adds no time saved, revenue or client results.', origin: 'Your facts, preserved' }
};
const editButtons = [...document.querySelectorAll('[data-edit]')];
const comparison = document.querySelector('.rewrite-comparison');
let demoTimers = [];
const playButton = document.querySelector('#play-demo');
const originalToggle = document.querySelector('#toggle-original');
function updatePlaybackAvailability() { playButton.hidden = motionQuery.matches; }
updatePlaybackAvailability();
originalToggle.addEventListener('click', () => {
  const expanded = originalToggle.getAttribute('aria-expanded') !== 'true';
  originalToggle.setAttribute('aria-expanded', String(expanded));
  comparison.classList.toggle('show-original', expanded);
  originalToggle.textContent = expanded ? 'Hide the original draft ↑' : 'Show the original draft ↓';
});
function stopDemo() {
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  playButton.textContent = 'Play the rewrite ↻';
}
function selectEdit(key) {
  const step = editSteps[key];
  comparison.dataset.activeEdit = key;
  editButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.edit === key)));
  document.querySelector('#edit-number').textContent = step.number;
  document.querySelector('#edit-title').textContent = step.title;
  document.querySelector('#edit-description').textContent = step.description;
  document.querySelector('#edit-origin').textContent = step.origin;
  if (!motionQuery.matches) {
    comparison.querySelector('.revised-post').animate([{ transform: 'translateY(4px)' }, { transform: 'translateY(0)' }], { duration: 350, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
}
editButtons.forEach(button => button.addEventListener('click', () => {
  stopDemo(); selectEdit(button.dataset.edit);
  if (window.innerWidth <= 640) {
    comparison.classList.remove('show-original');
    originalToggle.setAttribute('aria-expanded', 'false');
    originalToggle.textContent = 'Show the original draft ↓';
    comparison.querySelector('.revised-post [data-part=' + button.dataset.edit + ']').scrollIntoView({ block: 'center', behavior: motionQuery.matches ? 'instant' : 'smooth' });
  }
}));
playButton.addEventListener('click', () => {
  if (demoTimers.length) { stopDemo(); return; }
  selectEdit('opening');
  if (motionQuery.matches) return;
  playButton.textContent = 'Pause the rewrite Ⅱ';
  demoTimers.push(setTimeout(() => selectEdit('body'), 3500));
  demoTimers.push(setTimeout(() => selectEdit('payoff'), 7000));
  demoTimers.push(setTimeout(stopDemo, 10500));
});
motionQuery.addEventListener('change', () => { if (motionQuery.matches) stopDemo(); updatePlaybackAvailability(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopDemo(); });

const prompts = {
  rewrite: 'For the draft I just sent, give me another version for [reader]. Keep the facts I supplied. Explain which changes come from the research and which are your writing choices.',
  compare: 'Give me another opening for the draft I just sent. Keep the rest of the post unchanged and use only the facts I supplied. Explain the reason for the change.',
  examples: 'Show me the original links for the examples behind your suggestions. Explain the author-relative engagement comparison and whether each example applies to my topic. Help me use a relevant structure with these facts from my work: [your facts].'
};
const promptTabs = [...document.querySelectorAll('[data-prompt]')];
const promptText = document.querySelector('#prompt-text');
const copyStatus = document.querySelector('#copy-status');
function selectPrompt(button) {
  promptTabs.forEach(tab => { const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  document.querySelector('#prompt-panel').setAttribute('aria-labelledby', button.id);
  promptText.textContent = prompts[button.dataset.prompt];
  copyStatus.textContent = '';
}
promptTabs.forEach((button, index) => {
  button.addEventListener('click', () => selectPrompt(button));
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % promptTabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + promptTabs.length) % promptTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = promptTabs.length - 1;
    if (next !== undefined) { event.preventDefault(); promptTabs[next].focus(); selectPrompt(promptTabs[next]); }
  });
});
document.querySelector('#copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptText.textContent);
    copyStatus.textContent = 'Copied. Paste this into the ChatGPT conversation after sending your draft from the editor.';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(promptText);
    selection.removeAllRanges(); selection.addRange(range);
    copyStatus.textContent = 'The prompt is selected. Copy it with your keyboard or touch menu.';
  }
});

const dialog = document.querySelector('#preview-dialog');
document.querySelector('#open-preview').addEventListener('click', () => dialog.showModal());
document.querySelector('#close-preview').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
const stickyCta = document.querySelector('#sticky-cta');
let pastHero = false;
let atFinalCta = false;
function updateSticky() {
  const accessBox = document.querySelector('#access').getBoundingClientRect();
  const atAccess = accessBox.bottom > 0 && accessBox.top < window.innerHeight;
  const visible = pastHero && !atFinalCta && !atAccess;
  stickyCta.classList.toggle('visible', visible);
  stickyCta.inert = !visible;
}
new IntersectionObserver(entries => {
  entries.forEach(entry => { pastHero = !entry.isIntersecting && entry.boundingClientRect.bottom < 0; });
  updateSticky();
}).observe(document.querySelector('.hero'));
new IntersectionObserver(entries => {
  entries.forEach(entry => { atFinalCta = entry.isIntersecting; });
  updateSticky();
}, { rootMargin: '0px 0px 100px 0px' }).observe(document.querySelector('.final-cta'));
new IntersectionObserver(updateSticky).observe(document.querySelector('#access'));

// Reuse the resource engine's existing capture/delivery endpoint. This page uses
// a dedicated delivery-only route, so it cannot enter the legacy Guide nurture.
const accessForm = document.querySelector('#access-form');
const accessStatus = document.querySelector('#access-status');
const accessSubmit = document.querySelector('#access-submit');
const accessKey = 'ivan.content-patterns.access.v1';
function unlockAccess(deliveryOk, returning = false) {
  accessForm.hidden = true;
  document.querySelector('#access-success').hidden = false;
  document.querySelector('#prompt-workspace').hidden = false;
  document.querySelector('#prompt-lock').hidden = true;
  if (!returning) document.querySelector('#access-success-title').focus({ preventScroll: true });
  document.querySelector('#delivery-status').textContent = returning
    ? 'Your editor link and prompts are ready. You can open them again here.'
    : deliveryOk
      ? 'The guide link is on its way to your inbox. You can start here now.'
      : 'Your signup is saved. The email could not be sent just now, so use the editor and prompt pack here.';
  document.querySelector('.access-footnote').textContent = 'Install the plugin, open Content BRAIN and paste your draft into the editor.';
  document.querySelectorAll('[data-cta$="access"]').forEach(link => {
    link.href = '#access';
  });
}
try {
  if (localStorage.getItem(accessKey) === 'yes') unlockAccess(true, true);
} catch { /* Access also works for this visit when browser storage is blocked. */ }
const accessParams = new URLSearchParams(location.search);
if (accessParams.get('access') === 'email' || accessParams.get('src') === 'dm') unlockAccess(true, true);
accessForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!accessForm.reportValidity()) return;
  const email = document.querySelector('#access-email').value.trim().toLowerCase();
  const firstName = document.querySelector('#access-name').value.trim();
  accessStatus.textContent = '';
  accessSubmit.disabled = true;
  accessSubmit.textContent = 'Getting your guide…';
  const q = new URLSearchParams(location.search);
  const body = {
    event_type: 'landing_capture', tool_type: 'landing', lm_slug: 'content-brain-guide',
    email, first_name: firstName,
    src: q.get('src') || 'plugin_guide',
    utm: { source: q.get('utm_source'), medium: q.get('utm_medium'), campaign: q.get('utm_campaign'), term: q.get('utm_term'), content: q.get('utm_content') },
    prospect_id: q.get('pid') || null, referrer: document.referrer || '',
    session_id: reader.session_id,
    answers: { signup_offer: 'plugin_and_prompt_pack', consent_copy: document.querySelector('#access-consent').textContent, consent_version: '20261018', consent_at: new Date().toISOString() }
  };
  try {
    const response = await fetch('https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || !result.ok || !result.event_id) throw new Error('capture_failed');
    try { localStorage.setItem(accessKey, 'yes'); } catch { /* Current-visit access remains available. */ }
    unlockAccess(result.delivery?.ok === true);
  } catch {
    accessStatus.textContent = "Your signup didn't go through. Please try again. Your email is still in the form.";
    accessSubmit.disabled = false;
    accessSubmit.textContent = 'Get my free editor + prompts ↗';
  }
});
if (location.hostname === 'resources.ivanmanfredi.com') {
  function track(event, cta) {
    const q = new URLSearchParams(location.search);
    const payload = { event_type: event, tool_type: 'plugin-guide', lm_slug: 'content-brain-guide',
      session_id: reader.session_id, src: q.get('src') || 'plugin_guide', referrer: document.referrer,
      utm: { source: q.get('utm_source'), medium: q.get('utm_medium'), campaign: q.get('utm_campaign'), term: q.get('utm_term'), content: q.get('utm_content') },
      answers: cta ? { cta } : null };
    fetch('https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
  }
  track('view');
  document.querySelectorAll('[data-cta]').forEach(link => link.addEventListener('click', () => track('cta_click', link.dataset.cta)));
}
