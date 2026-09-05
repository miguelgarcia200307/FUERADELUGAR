import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const screenshotPaths={mobile:join(tmpdir(),'fdl-admin-entities-mobile.png'),teamMenu:join(tmpdir(),'fdl-admin-team-menu-mobile.png'),desktop:join(tmpdir(),'fdl-admin-entities-desktop.png')};
const tabs=await fetch('http://localhost:9223/json/list').then(response=>response.json());
const page=tabs.find(tab=>tab.type==='page');
if(!page)throw new Error('No se encontró una pestaña para QA.');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});

let id=0;const pending=new Map();const runtimeErrors=[];
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const task=pending.get(message.id);pending.delete(message.id);return message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')runtimeErrors.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text||'Runtime exception');});
function command(method,params={}){const requestId=++id;socket.send(JSON.stringify({id:requestId,method,params}));return new Promise((resolve,reject)=>pending.set(requestId,{resolve,reject}));}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const evaluate=expression=>command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).then(result=>{if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;});
async function waitFor(selector,timeout=6000){const started=Date.now();while(Date.now()-started<timeout){if(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`))return;await delay(100);}throw new Error(`No apareció ${selector} dentro del tiempo esperado.`);}

const bootstrap=`(() => {
  const userId='11111111-1111-4111-8111-111111111111';
  const base64=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');
  const token=base64({alg:'none',typ:'JWT'})+'.'+base64({sub:userId,role:'authenticated',exp:4102444800})+'.qa';
  localStorage.setItem('sb-gacqqaimdfvkmznsglpg-auth-token',JSON.stringify({access_token:token,refresh_token:'qa-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'admin@qa.local',role:'authenticated'}}));
  const categories=[
    {id:'c-root',name:'Uniformes de Fútbol Adulto',slug:'uniformes-futbol-adulto',active:true,sort_order:1,parent_id:null,created_at:'2026-01-01T00:00:00Z'},
    {id:'c-clubes',name:'Clubes',slug:'clubes-adulto',active:true,sort_order:2,parent_id:'c-root',created_at:'2026-01-02T00:00:00Z'},
    {id:'c-seleccion',name:'Selección',slug:'seleccion-adulto',active:true,sort_order:3,parent_id:'c-root',created_at:'2026-01-03T00:00:00Z'},
    {id:'c-empty',name:'Categoría sin dependencias',slug:'categoria-sin-dependencias',active:false,sort_order:4,parent_id:null,created_at:'2026-01-04T00:00:00Z'}
  ];
  for(let index=categories.length;index<150;index++){const number=index+1;const isChild=number%3!==0;categories.push({id:'c-'+number,name:(isChild?'Subcategoría ':'Categoría ')+String(number).padStart(3,'0'),slug:'categoria-'+number,active:number%5!==0,sort_order:number,parent_id:isChild?'c-root':null,created_at:new Date(Date.UTC(2026,0,(number%28)+1)).toISOString()});}
  const teams=[
    {id:'t-real',name:'Real Madrid',slug:'real-madrid',active:true,type:'club',created_at:'2026-01-01T00:00:00Z'},
    {id:'t-colombia',name:'Colombia',slug:'colombia',active:true,type:'national_team',created_at:'2026-01-02T00:00:00Z'},
    {id:'t-empty',name:'Equipo sin productos',slug:'equipo-sin-productos',active:false,type:'colombian_team',created_at:'2026-01-03T00:00:00Z'}
  ];
  for(let index=teams.length;index<100;index++){const number=index+1;const types=['club','national_team','colombian_team'];teams.push({id:'t-'+number,name:'Equipo '+String(number).padStart(3,'0'),slug:'equipo-'+number,active:number%6!==0,type:types[number%3],created_at:new Date(Date.UTC(2026,1,(number%28)+1)).toISOString()});}
  const brands=[
    {id:'b-adidas',name:'Adidas',slug:'adidas',active:true,created_at:'2026-01-01T00:00:00Z'},
    {id:'b-nike',name:'Nike',slug:'nike',active:true,created_at:'2026-01-02T00:00:00Z'},
    {id:'b-empty',name:'Marca sin productos',slug:'marca-sin-productos',active:false,created_at:'2026-01-03T00:00:00Z'}
  ];
  for(let index=brands.length;index<80;index++){const number=index+1;brands.push({id:'b-'+number,name:'Marca '+String(number).padStart(3,'0'),slug:'marca-'+number,active:number%7!==0,created_at:new Date(Date.UTC(2026,2,(number%28)+1)).toISOString()});}
  const products=[
    {id:'p-real',name:'Camiseta Real Madrid',slug:'camiseta-real-madrid',base_price:99000,status:'published',team_id:'t-real',brand_id:'b-adidas',updated_at:'2026-05-01T00:00:00Z',teams:teams[0],brands:brands[0],product_categories:[{category_id:'c-root',categories:categories[0]},{category_id:'c-clubes',categories:categories[1]}],product_images:[],product_variants:[]},
    {id:'p-colombia',name:'Camiseta Colombia',slug:'camiseta-colombia',base_price:89000,status:'published',team_id:'t-colombia',brand_id:'b-nike',updated_at:'2026-05-02T00:00:00Z',teams:teams[1],brands:brands[1],product_categories:[{category_id:'c-seleccion',categories:categories[2]}],product_images:[],product_variants:[]}
  ];
  const dependencies=(type,entityId)=>{const items=type==='categories'?categories:type==='teams'?teams:brands;const exists=items.some(item=>item.id===entityId);const productCount=type==='categories'?products.filter(product=>product.product_categories.some(row=>row.category_id===entityId)).length:type==='teams'?products.filter(product=>product.team_id===entityId).length:products.filter(product=>product.brand_id===entityId).length;const childCount=type==='categories'?categories.filter(item=>item.parent_id===entityId).length:0;return{exists,product_count:productCount,child_count:childCount,can_delete:exists&&!productCount&&!childCount};};
  window.__qaData={categories,teams,brands,products};
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?input:input.url;if(!url.includes('gacqqaimdfvkmznsglpg.supabase.co'))return originalFetch(input,options);
    const payload=options.body?JSON.parse(options.body):{};let body=[];
    if(url.includes('/rest/v1/admins'))body={user_id:userId};
    else if(url.includes('/rest/v1/rpc/catalog_entity_dependencies'))body=dependencies(payload.entity_type,payload.entity_id);
    else if(url.includes('/rest/v1/rpc/delete_catalog_entity_safely')){const result=dependencies(payload.entity_type,payload.entity_id);body={...result,deleted:result.can_delete,reason:result.can_delete?null:result.child_count?'children':result.product_count?'products':'not_found'};}
    else if(url.includes('/rest/v1/products'))body=products;
    else if(url.includes('/rest/v1/categories'))body=categories;
    else if(url.includes('/rest/v1/teams'))body=teams;
    else if(url.includes('/rest/v1/brands'))body=brands;
    else if(url.includes('/rest/v1/site_settings'))body={id:1,business_name:'Fuera de Lugar Sport',whatsapp:'573001112233',checkout_behavior:'keep'};
    else if(url.includes('/rest/v1/payment_methods'))body=[];
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json','content-range':'0-199/200'}});
  };
})()`;

await command('Runtime.enable');await command('Page.enable');await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});await command('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap});
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await command('Page.navigate',{url:'http://localhost:8080/admin/index.html?section=categories'});await waitFor('#entity-search');

const initial=await evaluate(`(() => ({title:document.querySelector('.admin-heading h1')?.textContent,registered:document.querySelector('.admin-panel__head p')?.textContent,rows:document.querySelectorAll('[data-entity-id]').length,pagination:document.querySelector('.pagination')?.innerText,overflow:document.documentElement.scrollWidth>innerWidth,firstRowTop:Math.round(document.querySelector('[data-entity-id]')?.getBoundingClientRect().top||0)}))()`);
const search=async value=>{await evaluate(`(()=>{const input=document.querySelector('#entity-search');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(280);return evaluate(`(() => ({value:document.querySelector('#entity-search')?.value,text:document.querySelector('#entity-results')?.innerText,url:location.search,rows:document.querySelectorAll('[data-entity-id]').length}))()`);};
const futbolSearch=await search('futbol');const clubesSearch=await search('clubes');
await search('');await evaluate(`(()=>{document.querySelector('#entity-filters-button').click();const select=document.querySelector('#entity-filter-panel [data-entity-filter="kind"]');select.value='child';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100);
const categoryFilter=await evaluate(`(() => ({count:document.querySelector('.entity-results-meta span')?.textContent,onlyChildren:[...document.querySelectorAll('[data-entity-id]')].every(row=>row.classList.contains('entity-row--child')),filterLabel:document.querySelector('#entity-filters-button')?.innerText,url:location.search}))()`);
await evaluate(`(()=>{const select=document.querySelector('#entity-filter-panel [data-entity-filter="sort"]');select.value='za';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);const categorySort=await evaluate(`(() => ({names:[...document.querySelectorAll('[data-entity-id] .data-row__main strong')].slice(0,3).map(item=>item.textContent.trim()),url:location.search}))()`);
const emptyResult=await search('natacion xyz');
await evaluate(`document.querySelector('[data-clear-entities]').click()`);await delay(180);

await evaluate(`document.querySelector('[data-section="categories"]').click()`);await delay(120);await search('futbol');
const blockedCategory=await evaluate(`(async()=>{const row=document.querySelector('[data-entity-id="c-root"]');if(!row)return{missing:true,url:location.search,text:document.querySelector('#entity-results')?.innerText};row.querySelector('.action-menu').open=true;row.querySelector('[data-delete-entity]').click();await new Promise(resolve=>setTimeout(resolve,100));const result={title:document.querySelector('.modal h2')?.textContent,text:document.querySelector('.modal__content')?.innerText,products:Boolean(document.querySelector('[data-view-products]')),children:Boolean(document.querySelector('[data-view-children]'))};document.querySelector('[data-close-dependency]')?.click();return result;})()`);
await search('Categoría sin dependencias');
const cancellableCategory=await evaluate(`(async()=>{const row=document.querySelector('[data-entity-id="c-empty"]');if(!row)return{missing:true,url:location.search,text:document.querySelector('#entity-results')?.innerText};row.querySelector('.action-menu').open=true;row.querySelector('[data-delete-entity]').click();await new Promise(resolve=>setTimeout(resolve,100));const result={title:document.querySelector('.modal h2')?.textContent,confirm:document.querySelector('.modal [data-confirm]')?.textContent,message:document.querySelector('.modal__content p')?.textContent};document.querySelector('.modal [data-cancel]')?.click();await new Promise(resolve=>setTimeout(resolve,30));return{...result,preserved:Boolean(document.querySelector('[data-entity-id="c-empty"]'))};})()`);
await writeFile(screenshotPaths.mobile,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

await evaluate(`document.querySelector('[data-section="teams"]').click()`);await delay(150);const realSearch=await search('real');
const teamFilter=await evaluate(`(()=>{document.querySelector('[data-entity-quick="club"]').click();return{active:document.querySelector('[data-entity-quick="club"]').classList.contains('active'),count:document.querySelector('.entity-results-meta span')?.textContent,url:location.search};})()`);
await evaluate(`document.querySelector('[data-entity-id="t-real"] .action-menu').open=true`);await delay(50);
const teamMenuLayout=await evaluate(`(()=>{const menu=document.querySelector('[data-entity-id="t-real"] .action-menu__popover');const row=document.querySelector('[data-entity-id="t-real"]');const rect=menu.getBoundingClientRect();return{open:menu.closest('details').open,left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width),viewport:innerWidth,insideViewport:rect.left>=0&&rect.right<=innerWidth,rowZIndex:getComputedStyle(row).zIndex,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
await writeFile(screenshotPaths.teamMenu,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
const blockedTeam=await evaluate(`(async()=>{const row=document.querySelector('[data-entity-id="t-real"]');row.querySelector('.action-menu').open=true;row.querySelector('[data-delete-entity]').click();await new Promise(resolve=>setTimeout(resolve,100));const result={title:document.querySelector('.modal h2')?.textContent,text:document.querySelector('.modal__content')?.innerText};document.querySelector('[data-view-products]')?.click();await new Promise(resolve=>setTimeout(resolve,100));return{...result,relatedUrl:location.search};})()`);

await evaluate(`document.querySelector('[data-section="brands"]').click()`);await delay(150);const adidasSearch=await search('adid');
const blockedBrand=await evaluate(`(async()=>{const row=document.querySelector('[data-entity-id="b-adidas"]');row.querySelector('.action-menu').open=true;row.querySelector('[data-delete-entity]').click();await new Promise(resolve=>setTimeout(resolve,100));const result={title:document.querySelector('.modal h2')?.textContent,text:document.querySelector('.modal__content')?.innerText};document.querySelector('[data-close-dependency]')?.click();return result;})()`);

const viewports=[];
for(const [width,height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});
  for(const section of ['categories','teams','brands']){await evaluate(`document.querySelector('[data-section="${section}"]').click()`);await delay(35);viewports.push(await evaluate(`(() => ({section:${JSON.stringify(section)},size:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,searchVisible:Boolean(document.querySelector('#entity-search')?.getBoundingClientRect().height),rows:document.querySelectorAll('[data-entity-id]').length,firstRowTop:Math.round(document.querySelector('[data-entity-id]')?.getBoundingClientRect().top||0)}))()`));}
}
await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await evaluate(`document.querySelector('[data-section="categories"]').click()`);await delay(80);await writeFile(screenshotPaths.desktop,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

console.log(JSON.stringify({initial,searches:{futbolSearch,clubesSearch,realSearch,adidasSearch},categoryFilter,categorySort,emptyResult,blockedCategory,cancellableCategory,teamFilter,teamMenuLayout,blockedTeam,blockedBrand,viewports,runtimeErrors,screenshotPaths},null,2));socket.close();
