const dialog = document.querySelector('#preview-dialog');
const openPreview = document.querySelector('#open-preview');
const closePreview = document.querySelector('#close-preview');

openPreview?.addEventListener('click', () => dialog.showModal());
closePreview?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const original = button.textContent;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = original; }, 1800);
    } catch {
      const field = document.createElement('textarea');
      field.value = button.dataset.copy;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      button.textContent = copied ? 'Copied' : 'Select the request';
      setTimeout(() => { button.textContent = original; }, 1800);
    }
  });
});
