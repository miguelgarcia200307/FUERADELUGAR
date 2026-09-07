import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const screenshots = {
  mobile: join(tmpdir(), 'fdl-checkout-mobile.png'),
  payment: join(tmpdir(), 'fdl-checkout-payment-methods.png'),
  desktop: join(tmpdir(), 'fdl-checkout-desktop.png')
};
const tabs = await fetch('http://localhost:9223/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No se encontró una pestaña para QA.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
let validationRequests = 0;
let whatsappUrl = '';
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
  if (message.method === 'Runtime.consoleAPICalled' && message.params.args?.[0]?.value === '__QA_VALIDATE__') validationRequests += 1;
  if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/rpc/validate_cart')) validationRequests += 1;
  if (message.method === 'Fetch.requestPaused') {
    whatsappUrl = message.params.request.url;
    command('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Aborted' }).catch(() => {});
  }
});

function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => {
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
});
async function waitFor(selector, timeout = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(100);
  }
  throw new Error(`No apareció ${selector} dentro del tiempo esperado.`);
}

const bootstrap = `(() => {
  const cartKey='fueradelugar_cart_v1';
  const products=[
    {variant_id:'10000000-0000-4000-8000-000000000001',product_id:'20000000-0000-4000-8000-000000000001',line_id:'line-1',name:'Camiseta Real Madrid Local',slug:'camiseta-real-madrid-local',color:'Blanco',size:'M',quantity:2,stock:8,price:90000,personalization_price:15000,image:'assets/images/stock/jersey-white.jpg',personalization:{name:'MIGUEL',number:'10',font:'Clásica',logoUrl:'https://example.com/logo.png',logoPosition:'Pecho'}},
    {variant_id:'10000000-0000-4000-8000-000000000002',product_id:'20000000-0000-4000-8000-000000000002',line_id:'line-2',name:'Camiseta Colombia',slug:'camiseta-colombia',color:'Amarillo',size:'L',quantity:1,stock:6,price:85000,image:'assets/images/stock/jersey-red-action.jpg'},
    {variant_id:'10000000-0000-4000-8000-000000000003',product_id:'20000000-0000-4000-8000-000000000003',line_id:'line-3',name:'Balón profesional',slug:'balon-profesional',color:'Blanco',size:'5',quantity:1,stock:9,price:65000,image:'assets/images/stock/soccer-ball.jpg'},
    {variant_id:'10000000-0000-4000-8000-000000000004',product_id:'20000000-0000-4000-8000-000000000004',line_id:'line-4',name:'Guayos de fútbol',slug:'guayos-futbol',color:'Negro',size:'40',quantity:1,stock:5,price:180000,image:'assets/images/stock/cleats-field.jpg'},
    {variant_id:'10000000-0000-4000-8000-000000000005',product_id:'20000000-0000-4000-8000-000000000005',line_id:'line-5',name:'Maleta deportiva',slug:'maleta-deportiva',color:'Verde',size:'Única',quantity:1,stock:7,price:120000,image:'assets/images/stock/gym-bag-urban.jpg'}
  ];
  if(!localStorage.getItem(cartKey))localStorage.setItem(cartKey,JSON.stringify(products));
  window.__qaPriceChange=false;window.__qaStockShort=false;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?input:input.url;
    if(!url.includes('gacqqaimdfvkmznsglpg.supabase.co'))return originalFetch(input,options);
    let body=[];
    if(url.includes('/rest/v1/site_settings'))body={id:1,business_name:'Fuera de Lugar Sport',whatsapp:'573001234567',address:'Calle 17 No. 8 - 46, Centro',city:'Valledupar - Cesar',maps_url:'https://maps.google.com/?q=Valledupar',checkout_behavior:'keep'};
    else if(url.includes('/rest/v1/payment_methods'))body=localStorage.getItem('__qa_no_payments')==='1'?[]:[
      {id:'p1',name:'Daviplata',instructions:'La tienda enviará los datos para transferir.',logo_url:'assets/images/teams/colombia.svg',active:true,sort_order:1},
      {id:'p2',name:'Bancolombia',instructions:'Confirmaremos la cuenta por WhatsApp.',active:true,sort_order:2},
      {id:'p3',name:'Efectivo',instructions:'Disponible según el método de entrega.',active:true,sort_order:3}
    ];
    else if(url.includes('/rest/v1/rpc/validate_cart')){
      console.log('__QA_VALIDATE__');
      const payload=JSON.parse(options.body||'{}').cart_items||[];
      const stored=JSON.parse(localStorage.getItem(cartKey)||'[]');
      body=payload.map((item,index)=>{const product=products.find(row=>row.variant_id===item.variant_id);const saved=stored.find(row=>row.variant_id===item.variant_id)||product;const stock=window.__qaStockShort&&index===0?1:product.stock;const price=window.__qaPriceChange&&index===0?95000:saved.price;return{variant_id:product.variant_id,product_id:product.product_id,product_name:product.name,product_slug:product.slug,product_status:'published',color_name:product.color,size_name:product.size,stock,current_price:price,requested_quantity:item.quantity,valid:stock>=item.quantity,reason:stock>=item.quantity?null:'Actualmente solo quedan '+stock+' unidades.'};});
    }
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json','content-range':'0-99/100'}});
  };
})()`;

await command('Runtime.enable');
await command('Network.enable');
await command('Page.enable');
await command('Network.setCacheDisabled', { cacheDisabled: true });
await command('Storage.clearDataForOrigin', { origin: 'http://localhost:8080', storageTypes: 'local_storage' });
await command('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/checkout.html' });
await waitFor('.checkout-choice--payment');
await delay(150);

const firstViewport = await evaluate(`(() => {
  const rect=selector=>{const node=document.querySelector(selector);const box=node.getBoundingClientRect();return{top:Math.round(box.top),bottom:Math.round(box.bottom),visible:box.top<innerHeight&&box.bottom>0};};
  const sticky=document.querySelector('#checkout-sticky').getBoundingClientRect();
  const nav=document.querySelector('.mobile-nav').getBoundingClientRect();
  return{viewport:[innerWidth,innerHeight],title:rect('.checkout-title-row h1'),summary:rect('#checkout-summary-mobile'),contact:rect('#contact-title'),summaryCollapsed:!document.querySelector('#checkout-summary-mobile').open,deliveryCards:document.querySelectorAll('[name="delivery"]').length,legacySelects:document.querySelectorAll('#checkout-form select').length,floatHidden:getComputedStyle(document.querySelector('.whatsapp-float')).display==='none',stickyAboveNav:sticky.bottom<=nav.top+1,overflow:document.documentElement.scrollWidth>innerWidth};
})()`);
await writeFile(screenshots.mobile, Buffer.from((await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
const summaryExpanded = await evaluate(`(() => {const details=document.querySelector('#checkout-summary-mobile');details.open=true;const result={rows:details.querySelectorAll('.checkout-order-item').length,customization:details.querySelector('.checkout-order-item small')?.textContent,editCart:details.querySelector('.checkout-edit-cart')?.getAttribute('href')};details.open=false;return result;})()`);

await evaluate(`document.querySelector('#checkout-primary-action').click()`);
await delay(400);
const inlineValidation = await evaluate(`(() => ({active:document.activeElement.id,name:document.querySelector('#fullName-error').textContent,phone:document.querySelector('#phone-error').textContent,delivery:document.querySelector('#delivery-error').textContent,city:document.querySelector('#city-error').textContent,payment:document.querySelector('#payment-error').textContent,nativeDialog:false}))()`);

const deliveryStates = await evaluate(`(() => {
  const select=value=>{const input=[...document.querySelectorAll('[name="delivery"]')].find(item=>item.value===value);input.click();};
  select('Recoger en tienda');const pickup={cityHidden:document.querySelector('#city-field').hidden,cityRequired:document.querySelector('#checkout-city').required,addressHidden:document.querySelector('#address-field').hidden,pickupVisible:!document.querySelector('#pickup-information').hidden,mapVisible:!document.querySelector('#pickup-map').hidden};
  select('Domicilio');const local={cityVisible:!document.querySelector('#city-field').hidden,cityRequired:document.querySelector('#checkout-city').required,addressVisible:!document.querySelector('#address-field').hidden,addressRequired:document.querySelector('#checkout-address').required,note:document.querySelector('#delivery-note').textContent};
  select('Envío nacional');const national={cityVisible:!document.querySelector('#city-field').hidden,cityRequired:document.querySelector('#checkout-city').required,addressVisible:!document.querySelector('#address-field').hidden,note:document.querySelector('#delivery-note').textContent};
  return{pickup,local,national};
})()`);

const paymentStates = await evaluate(`(() => {
  const choose=name=>[...document.querySelectorAll('[name="payment"]')].find(item=>item.value===name).click();
  choose('Daviplata');const daviplata=document.querySelector('[name="payment"]:checked').value;
  const logo=document.querySelector('[name="payment"][value="Daviplata"]').closest('label').querySelector('.checkout-payment-icon img')?.getAttribute('src');
  const bancolombia=document.querySelector('[name="payment"][value="Bancolombia"]').closest('label').querySelector('.checkout-payment-icon').textContent.trim();
  choose('Efectivo');const efectivo=document.querySelector('[name="payment"][value="Efectivo"]').closest('label').querySelector('.checkout-payment-icon').textContent.trim();return{daviplata,logo,bancolombia,efectivo,after:document.querySelector('[name="payment"]:checked').value,checked:document.querySelectorAll('[name="payment"]:checked').length};
})()`);
await evaluate(`(()=>{document.documentElement.style.scrollBehavior='auto';const target=document.querySelector('#payment-methods');scrollTo(0,target.getBoundingClientRect().top+scrollY-150);})()`);await delay(120);
await writeFile(screenshots.payment, Buffer.from((await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));

await evaluate(`(() => {
  const set=(name,value)=>{const input=document.querySelector('[name="'+name+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
  set('fullName','Miguel García');set('phone','300 123 4567');set('city','Valledupar');set('address','Calle 10 # 20-30, Apto 301');set('notes','Entregar después de las 4 p.m.');
  [...document.querySelectorAll('[name="delivery"]')].find(item=>item.value==='Domicilio').click();
  [...document.querySelectorAll('[name="payment"]')].find(item=>item.value==='Daviplata').click();
})()`);
await delay(350);
const savedDraft = await evaluate(`JSON.parse(localStorage.getItem('fueradelugar_checkout_v1'))`);
await command('Page.reload');
await waitFor('.checkout-choice--payment');
await delay(250);
const restoredDraft = await evaluate(`(() => ({name:document.querySelector('[name="fullName"]').value,phone:document.querySelector('[name="phone"]').value,city:document.querySelector('[name="city"]').value,address:document.querySelector('[name="address"]').value,delivery:document.querySelector('[name="delivery"]:checked')?.value,payment:document.querySelector('[name="payment"]:checked')?.value,notes:document.querySelector('[name="notes"]').value,addressVisible:!document.querySelector('#address-field').hidden}))()`);

await command('Page.navigate', { url: 'http://localhost:8080/carrito.html' });
await waitFor('.cart-item');
await command('Page.navigate', { url: 'http://localhost:8080/checkout.html' });
await waitFor('.checkout-choice--payment');
const cartRoundTrip = await evaluate(`(() => ({name:document.querySelector('[name="fullName"]').value,phone:document.querySelector('[name="phone"]').value,city:document.querySelector('[name="city"]').value,delivery:document.querySelector('[name="delivery"]:checked')?.value,payment:document.querySelector('[name="payment"]:checked')?.value}))()`);

await evaluate(`window.__qaPriceChange=true;document.querySelector('#checkout-primary-action').click()`);
await delay(350);
const priceChange = await evaluate(`(() => ({message:document.querySelector('#checkout-status').innerText,total:document.querySelector('#checkout-mobile-total').textContent,cartPrice:JSON.parse(localStorage.getItem('fueradelugar_cart_v1'))[0].price,url:location.pathname}))()`);
await evaluate(`window.__qaPriceChange=false;window.__qaStockShort=true;document.querySelector('#checkout-primary-action').click()`);
await delay(350);
const stockChange = await evaluate(`(() => ({message:document.querySelector('#checkout-status').innerText,reviewLink:document.querySelector('#checkout-status a')?.getAttribute('href'),url:location.pathname}))()`);
await evaluate(`window.__qaStockShort=false`);

const viewports = [];
for (const [width, height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await evaluate(`scrollTo(0,0)`);
  await delay(60);
  viewports.push(await evaluate(`(() => ({size:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,mobileSummary:getComputedStyle(document.querySelector('#checkout-summary-mobile')).display!=='none',desktopSidebar:getComputedStyle(document.querySelector('.checkout-sidebar')).display!=='none',deliveryColumns:getComputedStyle(document.querySelector('.checkout-choice-list--delivery')).gridTemplateColumns.split(' ').length}))()`));
}

await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await evaluate(`scrollTo(0,0);document.querySelector('#checkout-status').hidden=true;document.querySelectorAll('.toast').forEach(item=>item.remove())`);
await delay(80);
await writeFile(screenshots.desktop, Buffer.from((await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await evaluate(`localStorage.setItem('__qa_no_payments','1')`);
await command('Page.reload');
await waitFor('.checkout-payment-empty');
await evaluate(`document.querySelector('#checkout-primary-action').click()`);
await delay(350);
const emptyPayments = await evaluate(`(() => ({message:document.querySelector('#payment-error').textContent,active:document.activeElement.id||document.activeElement.className,blocked:location.pathname==='/checkout.html'}))()`);
await evaluate(`localStorage.removeItem('__qa_no_payments')`);
await command('Page.reload');
await waitFor('.checkout-choice--payment');
await evaluate(`scrollTo(0,0);document.querySelector('#checkout-status').hidden=true`);
await command('Fetch.enable', { patterns: [{ urlPattern: 'https://wa.me/*', requestStage: 'Request' }] });
const requestsBefore = validationRequests;
await evaluate(`(()=>{const button=document.querySelector('#checkout-primary-action');button.click();button.click();})()`);
await delay(900);
await command('Page.stopLoading');
await command('Fetch.disable');
const whatsappMessage = whatsappUrl ? decodeURIComponent(new URL(whatsappUrl).searchParams.get('text') || '') : '';
const completeOrder = {
  whatsappOpened: whatsappUrl.startsWith('https://wa.me/573001234567'),
  validationRequests: validationRequests - requestsBefore,
  contains: Object.fromEntries(['Miguel García','300 123 4567','Valledupar','Domicilio','Calle 10 # 20-30, Apto 301','Daviplata','Camiseta Real Madrid Local','Blanco','Talla: M','Cantidad: 2','MIGUEL','Número: 10','Logo: https://example.com/logo.png','TOTAL','Entregar después de las 4 p.m.'].map(value => [value, whatsappMessage.includes(value)]))
};

console.log(JSON.stringify({ firstViewport, summaryExpanded, inlineValidation, deliveryStates, paymentStates, persistence: { savedDraft, restoredDraft, cartRoundTrip }, priceChange, stockChange, emptyPayments, viewports, completeOrder, runtimeErrors, screenshots }, null, 2));
socket.close();
