const tabs = await fetch('http://localhost:9223/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page' && tab.url.startsWith('http://localhost:8080'));
if (!page) throw new Error('No se encontró la pestaña local para QA.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
let failRequests = false;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  }
  if (message.method === 'Fetch.requestPaused' && failRequests) {
    command('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Failed' }).catch(() => {});
  }
});
function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => result.result.value);

await command('Runtime.enable');
await command('Fetch.enable', { patterns: [{ urlPattern: 'https://*.supabase.co/*', requestStage: 'Request' }] });
await command('Page.navigate', { url: 'http://localhost:8080/' });
await delay(2500);
const slow = await evaluate(`({ skeletons: document.querySelectorAll('.skeleton-grid:empty,.skeleton-row:empty').length, header: Boolean(document.querySelector('#site-header')) })`);
await command('Page.stopLoading');
failRequests = true;
await command('Page.navigate', { url: 'http://localhost:8080/' });
await delay(9500);
const failure = await evaluate(`({ title: document.querySelector('.empty-state h1')?.textContent, message: document.querySelector('.empty-state p')?.textContent, retry: document.querySelector('#retry-page')?.textContent, technicalLeak: /postgrest|jwt|fetcherror/i.test(document.querySelector('main')?.innerText || '') })`);
await command('Fetch.disable');
console.log(JSON.stringify({ slow, failure }, null, 2));
socket.close();
