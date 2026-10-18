// Presentation only: preserve the signup form's existing display-based dialogs.
document.querySelectorAll('.auth-page .modal').forEach((dialog) => {
  let previousFocus = null;
  let open = false;
  const focusable = () => Array.from(dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]')).filter((node) => !node.disabled);
  new MutationObserver(() => {
    const visible = dialog.style.display !== 'none' && dialog.style.display !== '';
    if (visible === open) return;
    open = visible;
    dialog.setAttribute('aria-hidden', String(!open));
    if (open) {
      previousFocus = document.activeElement;
      dialog.setAttribute('aria-modal', 'true');
      (focusable()[0] || dialog).focus();
    } else {
      dialog.removeAttribute('aria-modal');
      previousFocus?.focus();
    }
  }).observe(dialog, { attributes: true, attributeFilter: ['style'] });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dialog.style.display = 'none';
    if (event.key !== 'Tab') return;
    const nodes = focusable();
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first) { event.preventDefault(); dialog.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
});
