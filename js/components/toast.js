export function toast(message, type = 'success', duration = 3200) {
  const root = document.querySelector('#toast-root') || document.body;
  const element = document.createElement('div');
  element.className = `toast toast--${type}`;
  element.setAttribute('role', type === 'error' ? 'alert' : 'status');
  element.textContent = message;
  root.append(element);
  setTimeout(() => element.remove(), duration);
}

