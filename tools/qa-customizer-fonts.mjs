import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tabs = await fetch('http://localhost:9223/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No se encontró una pestaña para QA.');

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
  const task = pending.get(message.id);
  pending.delete(message.id);
  message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
});

const command = (method, params = {}) => {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
};
const evaluate = expression => command('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true
}).then(result => {
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
});

const productFlowSource = await readFile(new URL('./qa-product-flow.mjs', import.meta.url), 'utf8');
const bootstrapSource = productFlowSource.match(/const bootstrap = `([\s\S]*?)`;\r?\n\r?\nawait command/)?.[1];
if (!bootstrapSource) throw new Error('No se pudo cargar el entorno aislado de producto.');
const bootstrap = Function(`return \`${bootstrapSource}\``)();

await command('Page.enable');
await command('Network.enable');
await command('Network.setCacheDisabled', { cacheDisabled: true });
await command('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await evaluate(`sessionStorage.setItem('qa-product-override', JSON.stringify({ is_personalizable: true, allow_name: true, allow_number: true, allow_logo: false, allow_font: true }))`);
await command('Page.navigate', { url: 'http://localhost:8080/producto.html?slug=qa-product' });

for (let attempt = 0; attempt < 50; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 100));
  await evaluate(`sessionStorage.setItem('qa-product-override', JSON.stringify({ is_personalizable: true, allow_name: true, allow_number: true, allow_logo: false, allow_font: true }))`);
  if (await evaluate(`Boolean(document.querySelector('#open-customizer'))`)) break;
}
await evaluate(`(() => {
  const button = document.querySelector('#open-customizer');
  if (!button) throw new Error(JSON.stringify({
    ready: document.readyState,
    main: document.querySelector('main')?.innerText,
    product: window.__qaData?.product,
    override: sessionStorage.getItem('qa-product-override')
  }));
  button.click();
})()`);
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 100));
  if (await evaluate(`Boolean(document.querySelector('#custom-font'))`)) break;
}

const result = await evaluate(`(async () => {
  await document.fonts.ready;
  const name = document.querySelector('#custom-name');
  const number = document.querySelector('#custom-number');
  const select = document.querySelector('#custom-font');
  if (!name || !number || !select) throw new Error('No se abrió el personalizador.');
  name.value = 'MIGUEL';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  number.value = '10';
  number.dispatchEvent(new Event('input', { bubbles: true }));
  const rows = [];
  for (const option of [...select.options]) {
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const art = document.querySelector('.customizer-artboard').getBoundingClientRect();
    const nameBox = document.querySelector('.customizer-name').getBoundingClientRect();
    const numberBox = document.querySelector('.customizer-number').getBoundingClientRect();
    const nameText = document.querySelector('[data-preview-name-text]');
    const numberText = document.querySelector('[data-preview-number-text]');
    const nameTextBox = nameText.getBoundingClientRect();
    const numberTextBox = numberText.getBoundingClientRect();
    const metric = box => ({
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
      centerDelta: Math.round(((box.left + box.width / 2) - (art.left + art.width / 2)) * 10) / 10
    });
    rows.push({
      font: option.value,
      name: metric(nameBox),
      number: metric(numberBox),
      nameInk: metric(nameTextBox),
      numberInk: metric(numberTextBox),
      nameScale: getComputedStyle(nameText).getPropertyValue('--font-visual-scale').trim(),
      numberScale: getComputedStyle(numberText).getPropertyValue('--font-visual-scale').trim(),
      nameCorrection: getComputedStyle(nameText).getPropertyValue('--font-center-correction').trim(),
      numberCorrection: getComputedStyle(numberText).getPropertyValue('--font-center-correction').trim()
    });
  }
  return rows;
})()`);

const screenshotPaths = [];
for (const font of result.map(item => item.font)) {
  await evaluate(`(() => {
    const select = document.querySelector('#custom-font');
    select.value = ${JSON.stringify(font)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise(resolve => setTimeout(resolve, 50));
  const screenshotPath = join(tmpdir(), `fdl-customizer-${font.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}.png`);
  await writeFile(screenshotPath, Buffer.from((await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  })).data, 'base64'));
  screenshotPaths.push(screenshotPath);
}

console.log(JSON.stringify({ result, screenshotPaths }, null, 2));
socket.close();
