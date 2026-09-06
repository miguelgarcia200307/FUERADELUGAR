import { writeFile } from 'node:fs/promises';

const tabs = await fetch('http://localhost:9225/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const callbacks = pending.get(message.id);
  pending.delete(message.id);
  message.error ? callbacks.reject(message.error) : callbacks.resolve(message.result);
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => result.result.value);
await command('Page.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 360, height: 900, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8081/index.html' });
await new Promise(resolve => setTimeout(resolve, 5500));
await evaluate(`scrollTo(0, document.documentElement.scrollHeight)`);
await new Promise(resolve => setTimeout(resolve, 250));
const metrics = await evaluate(`(() => {
  const footerLogo = document.querySelector('.footer-brand .brand__logo--footer');
  const headerLogo = document.querySelector('.header-main .brand__logo');
  return {
    footerSource: footerLogo?.getAttribute('src'),
    footerSize: footerLogo ? [Math.round(footerLogo.getBoundingClientRect().width), Math.round(footerLogo.getBoundingClientRect().height)] : null,
    footerRadius: footerLogo ? getComputedStyle(footerLogo).borderRadius : null,
    headerSource: headerLogo?.getAttribute('src'),
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
  };
})()`);
const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('.qa/footer-logo-mobile.png', Buffer.from(data, 'base64'));
console.log(JSON.stringify(metrics, null, 2));
socket.close();
