import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const screenshotPaths={dashboard:join(tmpdir(),'fdl-admin-dashboard-mobile.png'),stock:join(tmpdir(),'fdl-admin-stock-mobile.png'),desktop:join(tmpdir(),'fdl-admin-products-desktop.png')};
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
const runtimeErrors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
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

const bootstrap = `(() => {
  const userId='11111111-1111-4111-8111-111111111111';
  const base64=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');
  const token=base64({alg:'none',typ:'JWT'})+'.'+base64({sub:userId,role:'authenticated',exp:4102444800})+'.qa';
  localStorage.setItem('sb-gacqqaimdfvkmznsglpg-auth-token',JSON.stringify({access_token:token,refresh_token:'qa-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'admin@qa.local',role:'authenticated'}}));
  const categories=[{id:'c1',name:'Camisetas',slug:'camisetas',active:true,sort_order:1,parent_id:null},{id:'c2',name:'Accesorios',slug:'accesorios',active:true,sort_order:2,parent_id:null}];
  const teams=[{id:'t1',name:'Argentina',slug:'argentina',active:true,type:'national_team'},{id:'t2',name:'Real Madrid',slug:'real-madrid',active:true,type:'club'}];
  const brands=[{id:'b1',name:'Adidas',slug:'adidas',active:true},{id:'b2',name:'Nike',slug:'nike',active:true}];
  const products=Array.from({length:250},(_,index)=>{
    const number=index+1;const argentina=index===0;const id='p'+number;const stocks=number===1?[0,2,8,4]:[number%9,(number+2)%9,(number+4)%9,(number+6)%9];
    const colors=[{id:id+'-black',name:argentina?'Celeste':'Negro',hex_code:'#111111',sort_order:0},{id:id+'-blue',name:'Azul',hex_code:'#168a4c',sort_order:1}];
    const sizes=[{id:id+'-s',name:'S',sort_order:0},{id:id+'-xl',name:'XL',sort_order:1}];
    return {id,name:argentina?'Camiseta Argentina Local':('Producto deportivo '+number),slug:argentina?'camiseta-argentina-local':('producto-'+number),description:'Producto de prueba',material:'Poliéster',base_price:79000,promo_price:number%12===0?69000:null,promo_start:null,promo_end:null,status:number%11===0?'draft':number%17===0?'hidden':'published',team_id:argentina?'t1':'t2',brand_id:number%2?'b1':'b2',featured:number<5,force_last_units:false,force_sold_out:false,updated_at:new Date(Date.now()-index*60000).toISOString(),teams:argentina?teams[0]:teams[1],brands:number%2?brands[0]:brands[1],product_categories:[{category_id:'c1',categories:categories[0]}],product_colors:colors,product_sizes:sizes,product_variants:[
      {id:id+'-v1',color_id:colors[0].id,size_id:sizes[0].id,stock:stocks[0],active:true,updated_at:new Date().toISOString()},
      {id:id+'-v2',color_id:colors[0].id,size_id:sizes[1].id,stock:stocks[1],active:true,updated_at:new Date().toISOString()},
      {id:id+'-v3',color_id:colors[1].id,size_id:sizes[0].id,stock:stocks[2],active:true,updated_at:new Date().toISOString()},
      {id:id+'-v4',color_id:colors[1].id,size_id:sizes[1].id,stock:stocks[3],active:true,updated_at:new Date().toISOString()}
    ],product_images:[{id:id+'-img',color_id:null,url:'../assets/images/product-white.svg',alt_text:'',is_primary:true,sort_order:0}]};
  });
  window.__qaData={categories,teams,brands,products};window.__failStock=false;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?input:input.url;if(!url.includes('gacqqaimdfvkmznsglpg.supabase.co'))return originalFetch(input,options);
    const method=(options.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();let body=[];
    if(url.includes('/rest/v1/admins'))body={user_id:userId};
    else if(url.includes('/rest/v1/products'))body=products;
    else if(url.includes('/rest/v1/categories'))body=categories;
    else if(url.includes('/rest/v1/teams'))body=teams;
    else if(url.includes('/rest/v1/brands'))body=brands;
    else if(url.includes('/rest/v1/site_settings'))body={id:1,business_name:'Fuera de Lugar Sport',whatsapp:'573001112233',checkout_behavior:'keep'};
    else if(url.includes('/rest/v1/payment_methods'))body=[];
    else if(url.includes('/rest/v1/product_variants')&&method==='PATCH'){
      if(window.__failStock)return new Response(JSON.stringify({message:'QA failure'}),{status:500,headers:{'content-type':'application/json'}});
      const values=JSON.parse(options.body||'{}');const variant=products.flatMap(product=>product.product_variants).find(item=>url.includes(encodeURIComponent(item.id))||url.includes(item.id));if(variant)Object.assign(variant,values);body=variant||values;
    }
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json','content-range':'0-249/250'}});
  };
})()`;

await command('Runtime.enable');
await command('Page.enable');
await command('Runtime.addBinding', { name: '__qaBinding' });
await command('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/admin/index.html' });
await delay(3000);

const dashboard = await evaluate(`(() => ({
  title:document.querySelector('.admin-heading h1')?.textContent,
  metrics:document.querySelectorAll('.stat-card').length,
  quickActions:document.querySelectorAll('.quick-action').length,
  recent:document.querySelectorAll('[data-product]').length,
  attention:Boolean(document.querySelector('.attention-panel')),
  horizontalOverflow:document.documentElement.scrollWidth>innerWidth
}))()`);
await writeFile(screenshotPaths.dashboard,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

const drawer = await evaluate(`(async()=>{
  const menu=document.querySelector('#admin-menu');menu.click();await new Promise(resolve=>setTimeout(resolve,30));
  const opened={open:document.querySelector('#admin-sidebar').classList.contains('open'),backdrop:!document.querySelector('#admin-sidebar-backdrop').hidden,locked:document.body.classList.contains('no-scroll'),expanded:menu.getAttribute('aria-expanded')};
  const last=document.querySelector('#logout-button');last.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));const focusWrapped=document.activeElement===document.querySelector('#admin-sidebar a');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(resolve=>setTimeout(resolve,240));
  const escapeClosed=!document.querySelector('#admin-sidebar').classList.contains('open')&&document.querySelector('#admin-sidebar-backdrop').hidden;
  menu.click();document.querySelector('#admin-sidebar-backdrop').click();await new Promise(resolve=>setTimeout(resolve,240));
  const backdropClosed=!document.querySelector('#admin-sidebar').classList.contains('open');menu.click();document.querySelector('#admin-menu-close').click();await new Promise(resolve=>setTimeout(resolve,240));const buttonClosed=!document.querySelector('#admin-sidebar').classList.contains('open');
  menu.click();document.querySelector('[data-section="stock"]').click();await new Promise(resolve=>setTimeout(resolve,240));const selectionClosed=!document.querySelector('#admin-sidebar').classList.contains('open')&&location.search.includes('section=stock');
  return{...opened,focusWrapped,escapeClosed,backdropClosed,buttonClosed,selectionClosed};
})()`);

await evaluate(`document.querySelector('[data-section="dashboard"]').click()`);await delay(120);await evaluate(`document.querySelector('.stat-card--danger').click()`);await delay(400);
const stockFiltered = await evaluate(`(() => ({url:location.search,groups:document.querySelectorAll('.stock-product').length,rows:document.querySelectorAll('.stock-row').length,allOpen:[...document.querySelectorAll('.stock-product')].every(item=>item.open),overflow:document.documentElement.scrollWidth>innerWidth}))()`);
await evaluate(`document.querySelector('[data-stock-status="all"]').click()`);await delay(100);
await evaluate(`(() => {const input=document.querySelector('#stock-search-v2');input.value='Argentina XL';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(350);
const stockSearch = await evaluate(`(() => ({groups:document.querySelectorAll('.stock-product').length,text:document.querySelector('.stock-products')?.innerText,open:document.querySelector('.stock-product')?.open,scrollY,headerTop:document.querySelector('.admin-mobile-header')?.getBoundingClientRect().top,headerDisplay:getComputedStyle(document.querySelector('.admin-mobile-header')).display}))()`);
await writeFile(screenshotPaths.stock,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

const stockSave = await evaluate(`(async()=>{
  const row=document.querySelector('.stock-row');const input=row.querySelector('input');const before=input.value;row.querySelector('[data-plus]').click();await new Promise(resolve=>setTimeout(resolve,120));const success={before,after:input.value,state:row.querySelector('[data-save-state]').textContent};
  window.__failStock=true;row.querySelector('[data-plus]').click();await new Promise(resolve=>setTimeout(resolve,120));const rollback={value:input.value,state:row.querySelector('[data-save-state]').textContent};
  input.value='-1';input.dispatchEvent(new FocusEvent('blur',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,30));return{success,rollback,invalidValue:input.value};
})()`);

await evaluate(`document.querySelector('[data-section="products"]').click()`);await delay(250);
await evaluate(`(() => {const input=document.querySelector('#admin-product-search');input.value='Argentina';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(300);
const productsTest = await evaluate(`(() => ({rows:document.querySelectorAll('[data-product]').length,text:document.querySelector('#admin-product-results')?.innerText,url:location.search}))()`);
const destructiveCancel = await evaluate(`(async()=>{const menu=document.querySelector('.action-menu');menu.open=true;menu.querySelector('[data-delete]').click();await new Promise(resolve=>setTimeout(resolve,30));const dialog=Boolean(document.querySelector('.modal [data-confirm]'));document.querySelector('.modal [data-cancel]')?.click();await new Promise(resolve=>setTimeout(resolve,30));return{dialog,cancelled:!document.querySelector('.modal [data-confirm]'),rows:document.querySelectorAll('[data-product]').length};})()`);

const sections=[];
for(const section of ['categories','teams','brands','promotions','settings']){
  await evaluate(`document.querySelector('[data-section="${section}"]').click()`);await delay(140);
  sections.push(await evaluate(`(() => ({section:${JSON.stringify(section)},title:document.querySelector('.admin-heading h1')?.textContent,error:document.querySelector('.empty-state h1')?.textContent||null,overflow:document.documentElement.scrollWidth>innerWidth}))()`));
}
await evaluate(`document.querySelector('[data-section="products"]').click()`);await delay(180);

const viewports=[];
for(const [width,height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});await delay(80);
  viewports.push(await evaluate(`(() => ({size:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,sidebar:getComputedStyle(document.querySelector('.admin-sidebar')).visibility,header:getComputedStyle(document.querySelector('.admin-mobile-header')).display}))()`));
}
await evaluate(`document.querySelector('#toast-root').innerHTML=''`);await writeFile(screenshotPaths.desktop,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

console.log(JSON.stringify({dashboard,drawer,stockFiltered,stockSearch,stockSave,productsTest,destructiveCancel,sections,viewports,runtimeErrors,screenshotPaths},null,2));
socket.close();
