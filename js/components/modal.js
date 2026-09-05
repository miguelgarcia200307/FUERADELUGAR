let openModalCount = 0;

export function openModal({ title, content, onClose, className = '', description = '', trigger = null } = {}) {
  const root = document.querySelector('#modal-root') || document.body;
  const previousFocus = trigger || document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  if (className.includes('modal--customizer')) backdrop.classList.add('modal-backdrop--customizer');
  if (className.includes('modal--lightbox')) backdrop.classList.add('modal-backdrop--lightbox');
  const modalId = `modal-title-${crypto.randomUUID()}`;
  const descriptionId = `modal-description-${crypto.randomUUID()}`;
  backdrop.innerHTML = `<section class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="${modalId}" ${description ? `aria-describedby="${descriptionId}"` : ''}><header class="modal__head"><div><h2 id="${modalId}"></h2>${description ? `<p id="${descriptionId}" class="sr-only"></p>` : ''}</div><button class="modal__close" type="button" aria-label="Cerrar">×</button></header><div class="modal__content"></div></section>`;
  backdrop.querySelector(`#${modalId}`).textContent = title || '';
  if (description) backdrop.querySelector(`#${descriptionId}`).textContent = description;
  const contentRoot = backdrop.querySelector('.modal__content');
  if (typeof content === 'string') contentRoot.innerHTML = content;
  else if (content) contentRoot.append(content);
  let keyHandler;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    openModalCount = Math.max(0, openModalCount - 1);
    if (!openModalCount) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', keyHandler);
    onClose?.();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  };
  backdrop.querySelector('.modal__close').addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  keyHandler = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...backdrop.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', keyHandler);
  root.append(backdrop);
  openModalCount += 1;
  document.body.classList.add('no-scroll');
  backdrop.querySelector('.modal__close').focus();
  return { element: backdrop, contentRoot, close };
}

export function confirmAction(message, title = 'Confirmar', { confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', trigger = null } = {}) {
  return new Promise(resolve => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<p></p><div class="form-actions"><button class="btn btn--danger" data-confirm type="button">Confirmar</button><button class="btn btn--ghost" data-cancel type="button">Cancelar</button></div>`;
    wrapper.querySelector('p').textContent = message;
    wrapper.querySelector('[data-confirm]').textContent = confirmLabel;
    wrapper.querySelector('[data-cancel]').textContent = cancelLabel;
    const modal = openModal({ title, content: wrapper, trigger, onClose: () => resolve(false) });
    wrapper.querySelector('[data-confirm]').addEventListener('click', () => { resolve(true); modal.close(); });
    wrapper.querySelector('[data-cancel]').addEventListener('click', () => { resolve(false); modal.close(); });
  });
}
