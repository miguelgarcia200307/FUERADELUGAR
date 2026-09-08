import { writeFile } from 'node:fs/promises';
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
const runtimeErrors = [];
const consoleErrors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(item => item.description || item.value || '').join(' '));
});
const command = (method, params = {}) => {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
};
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
  const categories=[
    {id:'c-adult',name:'Uniformes de fútbol adulto',slug:'uniformes-adulto',parent_id:null,active:true,sort_order:1},
    {id:'c-adult-clubs',name:'Clubes',slug:'clubes-adulto',parent_id:'c-adult',active:true,sort_order:1},
    {id:'c-adult-national',name:'Selecciones',slug:'selecciones-adulto',parent_id:'c-adult',active:true,sort_order:2},
    {id:'c-kids',name:'Uniformes de fútbol niño',slug:'uniformes-nino',parent_id:null,active:true,sort_order:2},
    {id:'c-kids-clubs',name:'Clubes',slug:'clubes-nino',parent_id:'c-kids',active:true,sort_order:1},
    {id:'c-cleats',name:'Guayos',slug:'guayos',parent_id:null,active:true,sort_order:3}
  ];
  const teams=[{id:'t1',name:'Equipo QA',slug:'equipo-qa',type:'club',active:true}];
  const brands=[{id:'b1',name:'Marca QA',slug:'marca-qa',active:true}];
  const color={id:'color-1',name:'Verde',hex_code:'#168A4C',sort_order:0};
  const size={id:'size-1',name:'M',sort_order:0};
  const product={id:'product-qa',name:'Camiseta QA 2026',slug:'qa-product',description:'Camiseta edición 2026.',material:'Poliéster.',care_instructions:'Lavar a mano.',purchase_delivery_info:'Envío nacional disponible.',base_price:99000,promo_price:null,promo_start:null,promo_end:null,promo_enabled:true,status:'published',team_id:'t1',brand_id:'b1',featured:false,is_personalizable:false,personalization_price:15000,allow_name:true,allow_number:true,allow_logo:false,allow_font:true,allow_text_color:true,force_last_units:false,force_sold_out:false,size_guide_text:'M: 50 cm',size_guide_image_url:null,front_template_url:null,back_template_url:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),teams:teams[0],brands:brands[0],product_categories:[{category_id:'c-adult-clubs',categories:categories[1]}],product_colors:[color],product_sizes:[size],product_variants:[{id:'variant-1',color_id:color.id,size_id:size.id,stock:8,active:true,updated_at:new Date().toISOString()}],product_images:[{id:'image-1',color_id:null,url:'assets/images/product-green.svg',alt_text:'Producto QA',is_primary:true,sort_order:0},{id:'image-color-1',color_id:color.id,url:'assets/images/product-blue.svg',alt_text:'Producto QA verde',is_primary:false,sort_order:1}]};
  if(location.pathname.endsWith('/producto.html')){try{Object.assign(product,JSON.parse(sessionStorage.getItem('qa-product-override')||'{}'));}catch{}}
  window.__qaData={categories,teams,brands,product};window.__savedProductPayload=null;window.__savedCategoryRows=null;window.__savedImageRows=[];window.__savedColors=[];window.__primaryUpdates=0;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?input:input.url;if(!url.includes('gacqqaimdfvkmznsglpg.supabase.co'))return originalFetch(input,options);
    const method=(options.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
    const payload=typeof options.body==='string'?JSON.parse(options.body):null;let body=[];
    if(url.includes('/storage/v1/object/product-images')) body={Key:'product-images/qa-upload.jpg'};
    else if(url.includes('/rest/v1/admins')) body={user_id:userId};
    else if(url.includes('/rest/v1/categories')) body=categories;
    else if(url.includes('/rest/v1/teams')) body=teams;
    else if(url.includes('/rest/v1/brands')) body=brands;
    else if(url.includes('/rest/v1/payment_methods')) body=[];
    else if(url.includes('/rest/v1/site_settings')) body={id:1,business_name:'Fuera de Lugar Sport',whatsapp:'573001112233',checkout_behavior:'keep'};
    else if(url.includes('/rest/v1/products')){
      if(method==='PATCH'||method==='POST'){
        window.__savedProductPayload=payload;Object.assign(product,payload);body=product;
      }else body=url.includes('slug=eq.')?product:[product];
    }
    else if(url.includes('/rest/v1/product_categories')){if(method==='POST'){window.__savedCategoryRows=payload;body=payload;}else body=[];}
    else if(url.includes('/rest/v1/product_colors')){if(method==='GET')body=[{id:color.id}];else if(method==='POST'){body={id:'color-new-'+(window.__savedColors.length+1),...payload};window.__savedColors.push(body);}else body=Object.assign(color,payload||{});}
    else if(url.includes('/rest/v1/product_sizes')){body=method==='GET'?[{id:size.id}]:Object.assign(size,payload||{});}
    else if(url.includes('/rest/v1/product_variants')) body=payload||[];
    else if(url.includes('/rest/v1/product_images')){
      if(method==='POST'){const row={id:'image-'+(window.__savedImageRows.length+2),...payload};window.__savedImageRows.push(row);body=row;}
      else if(method==='PATCH'){if(payload?.is_primary===true)window.__primaryUpdates++;body=payload||{};}
      else if(method==='DELETE'){body=[];}
      else body=product.product_images;
    }
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json','content-range':'0-0/1'}});
  };
})()`;

await command('Runtime.enable');
await command('Page.enable');
await command('Network.enable');
await command('Network.setCacheDisabled', { cacheDisabled: true });
await command('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/admin/index.html?section=products' });
await delay(1800);
await evaluate(`document.querySelector('[data-product] [data-edit]').click()`);
await delay(150);

const initial = await evaluate(`(() => ({
  title:document.querySelector('.modal--product h2')?.textContent,
  description:document.querySelector('[name="description"]')?.value,
  material:document.querySelector('[name="material"]')?.value,
  care:document.querySelector('[name="care_instructions"]')?.value,
  delivery:document.querySelector('[name="purchase_delivery_info"]')?.value,
  selected:[...document.querySelectorAll('[name="categoryIds"]:checked')].map(input=>input.value),
  categoryCount:document.querySelector('[data-category-count]')?.textContent,
  master:document.querySelector('[name="is_personalizable"]')?.checked,
  customizationHidden:document.querySelector('[data-customization-panel]')?.hidden,
  sizeGuideOutsideCustomization:!document.querySelector('[data-customization-panel] [name="size_guide_text"]'),
  overflow:document.querySelector('.modal--product').scrollWidth>document.querySelector('.modal--product').clientWidth
}))()`);

const colorDeleteChoice = await evaluate(`(async()=>{const remove=document.querySelector('[data-remove-color]');remove.click();await new Promise(resolve=>setTimeout(resolve,30));const labels=[...document.querySelectorAll('.confirm-dialog__actions button')].map(button=>button.textContent.trim());[...document.querySelectorAll('.confirm-dialog__actions button')].find(button=>button.textContent.trim()==='Cancelar').click();await new Promise(resolve=>setTimeout(resolve,20));return{labels,colorStillPresent:Boolean(document.querySelector('[data-remove-color]'))};})()`);

const categoryBehavior = await evaluate(`(async()=>{
  const parent=document.querySelector('[name="categoryIds"][value="c-adult"]');const child=document.querySelector('[name="categoryIds"][value="c-adult-clubs"]');const toggle=document.querySelector('[data-category-toggle="c-adult"]');
  const before={parent:parent.checked,child:child.checked,expanded:toggle.getAttribute('aria-expanded')};toggle.click();await new Promise(resolve=>setTimeout(resolve,30));const afterToggle={parent:parent.checked,child:child.checked,expanded:toggle.getAttribute('aria-expanded')};parent.click();const afterParent={parent:parent.checked,child:child.checked};parent.click();
  const search=document.querySelector('[data-category-search-input]');search.value='clubes';search.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,30));
  return{before,afterToggle,afterParent,visibleParents:[...document.querySelectorAll('.product-category-tree>:not([hidden])>.product-category-row label span')].map(node=>node.textContent),visibleClubes:[...document.querySelectorAll('.product-category-children [data-category-node]:not([hidden]) label span')].map(node=>node.textContent)};
})()`);

const customization = await evaluate(`(async()=>{
  const master=document.querySelector('[name="is_personalizable"]');master.click();await new Promise(resolve=>setTimeout(resolve,30));const on={panelHidden:document.querySelector('[data-customization-panel]').hidden,expanded:master.getAttribute('aria-expanded')};
  document.querySelector('[name="allow_name"]').click();document.querySelector('[name="allow_number"]').click();document.querySelector('[name="allow_logo"]').click();
  const logoOnly={textHidden:document.querySelector('[data-text-options]').hidden,frontHidden:document.querySelector('[data-front-template]').hidden,backHidden:document.querySelector('[data-back-template]').hidden};
  document.querySelector('[name="allow_logo"]').click();document.querySelector('.product-editor [type="submit"]').click();await new Promise(resolve=>setTimeout(resolve,60));
  const validation={visible:!document.querySelector('[data-customization-error]').hidden,text:document.querySelector('[data-product-form-error]').textContent};
  document.querySelector('[name="allow_name"]').click();master.click();const off={panelHidden:document.querySelector('[data-customization-panel]').hidden,childDraft:document.querySelector('[name="allow_name"]').checked};master.click();const restored={panelHidden:document.querySelector('[data-customization-panel]').hidden,childDraft:document.querySelector('[name="allow_name"]').checked};master.click();
  return{on,logoOnly,validation,off,restored};
})()`);

await evaluate(`(()=>{const search=document.querySelector('[data-category-search-input]');search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-preview-form]').click();})()`);
await delay(80);
const preview = await evaluate(`(() => ({title:document.querySelector('.modal--product-preview h2')?.textContent,text:document.querySelector('.admin-product-preview')?.innerText,customization:Boolean(document.querySelector('.admin-product-preview__custom'))}))()`);
await evaluate(`document.querySelector('.modal--product-preview .modal__close').click()`);

const viewports=[];
for(const [width,height] of [[320,568],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1440,900]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});await delay(40);
  viewports.push(await evaluate(`(() => {const modal=document.querySelector('.modal--product');return{size:[innerWidth,innerHeight],pageOverflow:document.documentElement.scrollWidth>innerWidth,modalOverflow:modal.scrollWidth>modal.clientWidth,footerVisible:Boolean(document.querySelector('.product-editor .form-actions')),contentScroll:getComputedStyle(modal.querySelector('.modal__content')).overflowY};})()`));
}
const screenshotPath=join(tmpdir(),'fdl-product-editor-390.png');
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await evaluate(`document.querySelector('#photo-tabs').closest('.admin-form__section').scrollIntoView({block:'start'})`);await delay(80);
await writeFile(screenshotPath,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

await evaluate(`document.querySelector('.product-editor [type="submit"]').click()`);for(let attempt=0;attempt<40;attempt+=1){await delay(100);if(await evaluate(`!document.querySelector('.product-editor')`))break;}
const normalizedOff = await evaluate(`(() => {const p=window.__savedProductPayload;return{is_personalizable:p?.is_personalizable,personalization_price:p?.personalization_price,allow_name:p?.allow_name,allow_number:p?.allow_number,allow_logo:p?.allow_logo,allow_font:p?.allow_font,allow_text_color:p?.allow_text_color};})()`);
await evaluate(`document.querySelector('#new-product').click()`);await delay(80);
const createFlow = await evaluate(`(async()=>{
  const form=document.querySelector('.product-editor');const set=(name,value)=>{form.elements[name].value=value;form.elements[name].dispatchEvent(new Event('input',{bubbles:true}));};
  const jpegFile=async(name,color)=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,640,480);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));return new File([blob],name,{type:'image/jpeg'});};
  set('name','Producto integral QA móvil');set('description','Descripción real creada desde el formulario.');set('base_price','125000');set('material','Poliéster deportivo');set('care_instructions','Lavar con agua fría.');set('purchase_delivery_info','Domicilio en Valledupar y envío nacional.');set('size_guide_text','M: 50 cm de ancho.');
  form.elements.status.value='published';form.querySelector('[name="categoryIds"][value="c-adult"]').click();form.querySelector('[name="categoryIds"][value="c-adult-clubs"]').click();
  form.querySelector('#new-color-name').value='Verde QA';form.querySelector('#add-color').click();
  form.querySelector('#new-color-name').value='verde qa';form.querySelector('#add-color').click();const duplicateMessage=form.querySelector('#color-feedback').textContent;
  const firstColorTab=[...form.querySelectorAll('.photo-tab')].find(node=>node.textContent.includes('Verde QA'));firstColorTab.click();
  const transfer=new DataTransfer();transfer.items.add(await jpegFile('foto-repetida.jpg','#168a4c'));transfer.items.add(await jpegFile('foto-repetida.jpg','#174f9c'));form.querySelector('#product-files').files=transfer.files;form.querySelector('#product-files').dispatchEvent(new Event('change',{bubbles:true}));
  const firstColorInput=form.querySelector('[data-color-name]');firstColorInput.value='Azul rey';firstColorInput.dispatchEvent(new Event('input',{bubbles:true}));
  form.querySelector('#new-color-name').value='Rojo';form.querySelector('#add-color').click();[...form.querySelectorAll('.photo-tab')].find(node=>node.textContent.includes('Rojo')).click();const redTransfer=new DataTransfer();redTransfer.items.add(await jpegFile('rojo.jpg','#a9232a'));form.querySelector('#product-files').files=redTransfer.files;form.querySelector('#product-files').dispatchEvent(new Event('change',{bubbles:true}));
  [...form.querySelectorAll('.photo-tab')].find(node=>node.textContent.includes('Azul rey')).click();const moved=form.querySelector('[data-photo-color]');moved.value='';moved.dispatchEvent(new Event('change',{bubbles:true}));
  form.querySelector('#add-size').click();form.querySelector('#admin-sizes input').value='M';form.querySelector('#admin-sizes input').dispatchEvent(new Event('change',{bubbles:true}));
  form.querySelector('[data-stock]').value='12';form.elements.is_personalizable.click();form.elements.allow_logo.click();set('personalization_price','18000');
  const before={width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,categories:[...form.querySelectorAll('[name="categoryIds"]:checked')].map(input=>input.value),customizationVisible:!form.querySelector('[data-customization-panel]').hidden,stock:form.querySelector('[data-stock]').value,sectionOrder:[...form.querySelectorAll(':scope>.admin-form__section h3')].map(node=>node.textContent),hexVisible:Boolean(form.querySelector('[data-field="hex_code"]')),tabs:[...form.querySelectorAll('.photo-tab')].map(node=>node.textContent.trim()),activePhotos:form.querySelectorAll('.photo-card').length,duplicateMessage,renamedAssociation:[...form.querySelectorAll('.photo-tab')].some(node=>node.textContent.includes('Azul rey 1'))};
  for(let attempt=0;attempt<80;attempt+=1){if(!form.querySelector('.photo-card--busy'))break;await new Promise(resolve=>setTimeout(resolve,50));}form.querySelector('[type="submit"]').click();for(let attempt=0;attempt<60;attempt+=1){await new Promise(resolve=>setTimeout(resolve,100));if(!document.querySelector('.product-editor'))break;}const p=window.__savedProductPayload;
  return{before,saved:{name:p?.name,description:p?.description,material:p?.material,care_instructions:p?.care_instructions,purchase_delivery_info:p?.purchase_delivery_info,is_personalizable:p?.is_personalizable,allow_name:p?.allow_name,allow_number:p?.allow_number,allow_logo:p?.allow_logo,personalization_price:p?.personalization_price,status:p?.status},imageRows:window.__savedImageRows,primaryUpdates:window.__primaryUpdates,categoryRows:window.__savedCategoryRows,closed:!document.querySelector('.modal--product'),formError:form.querySelector('[data-product-form-error]')?.textContent,toasts:[...document.querySelectorAll('.toast')].map(node=>node.textContent),photoStates:[...form.querySelectorAll('.photo-card__status')].map(node=>node.textContent)};
})()`);
const noColorFlow = await evaluate(`(async()=>{document.querySelector('#new-product').click();await new Promise(resolve=>setTimeout(resolve,40));const form=document.querySelector('.product-editor');form.elements.name.value='Producto sin color QA';form.elements.base_price.value='50000';form.querySelector('#add-size').click();form.querySelector('#admin-sizes input').value='Única';form.querySelector('#admin-sizes input').dispatchEvent(new Event('change',{bubbles:true}));const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const context=canvas.getContext('2d');context.fillStyle='#168a4c';context.fillRect(0,0,640,480);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));const transfer=new DataTransfer();transfer.items.add(new File([blob],'general.jpg',{type:'image/jpeg'}));form.querySelector('#product-files').files=transfer.files;form.querySelector('#product-files').dispatchEvent(new Event('change',{bubbles:true}));const before={colorCount:form.querySelectorAll('[data-color-name]').length,tabs:[...form.querySelectorAll('.photo-tab')].map(node=>node.textContent.trim()),photos:form.querySelectorAll('.photo-card').length};for(let attempt=0;attempt<40;attempt+=1){if(!form.querySelector('.photo-card--busy'))break;await new Promise(resolve=>setTimeout(resolve,50));}form.requestSubmit();for(let attempt=0;attempt<30;attempt+=1){await new Promise(resolve=>setTimeout(resolve,100));if(!document.querySelector('.product-editor'))break;}return{before,closed:!document.querySelector('.product-editor'),error:form.querySelector('[data-product-form-error]')?.textContent};})()`);
await evaluate(`sessionStorage.setItem('qa-product-override',JSON.stringify({is_personalizable:false,allow_name:true,allow_number:true,allow_logo:true}))`);
await command('Page.navigate',{url:'http://localhost:8080/producto.html?slug=qa-product'});for(let attempt=0;attempt<40;attempt+=1){await delay(100);if(await evaluate(`Boolean(document.querySelector('#main-product-image'))`))break;}
const publicData = await evaluate(`(() => ({accordions:[...document.querySelectorAll('.product-accordions>section>button')].map(button=>button.textContent.trim()),text:document.querySelector('.product-accordions')?.innerText,personalization:Boolean(document.querySelector('#personalization-card')),galleryCount:document.querySelectorAll('.gallery__thumb').length,mainImage:document.querySelector('#main-product-image')?.getAttribute('src'),overflow:document.documentElement.scrollWidth>innerWidth,product:window.__qaData?.product,error:document.querySelector('main .empty-state')?.innerText||null}))()`);
await evaluate(`(()=>{sessionStorage.setItem('qa-product-override',JSON.stringify({description:null,material:null,care_instructions:null,purchase_delivery_info:null}));location.reload();})()`);await delay(700);
const emptyPublic = await evaluate(`(() => ({accordions:document.querySelectorAll('.product-accordions>section').length,details:Boolean(document.querySelector('#product-details')),bodyError:document.querySelector('main .empty-state h1')?.textContent||null}))()`);
await evaluate(`(()=>{sessionStorage.setItem('qa-product-override',JSON.stringify({description:'Detalle real',material:'Material real',care_instructions:'Cuidado real',purchase_delivery_info:'Entrega real',is_personalizable:true,allow_name:false,allow_number:false,allow_logo:true}));location.reload();})()`);await delay(700);
const validPublicCustomization = await evaluate(`(() => ({personalization:Boolean(document.querySelector('#personalization-card')),text:document.querySelector('#personalization-card')?.innerText,product:window.__qaData?.product,error:document.querySelector('main .empty-state')?.innerText||null}))()`);
await evaluate(`(()=>{sessionStorage.setItem('qa-product-override',JSON.stringify({description:'Detalle real',material:'Material real',care_instructions:'Cuidado real',purchase_delivery_info:'Entrega real',is_personalizable:true,allow_name:true,allow_number:true,allow_logo:false}));location.reload();})()`);await delay(1100);
await evaluate(`(()=>{const button=document.querySelector('#open-customizer');if(!button)throw new Error('No se renderizó el personalizador: '+document.querySelector('main')?.innerText);button.click();})()`);await delay(120);
const fontMetrics = await evaluate(`(async()=>{
  const name=document.querySelector('#custom-name');const number=document.querySelector('#custom-number');name.value='MIGUEL';name.dispatchEvent(new Event('input',{bubbles:true}));number.value='10';number.dispatchEvent(new Event('input',{bubbles:true}));const select=document.querySelector('#custom-font');const rows=[];
  for(const option of [...select.options]){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const art=document.querySelector('.customizer-artboard').getBoundingClientRect();const n=document.querySelector('.customizer-name').getBoundingClientRect();const d=document.querySelector('.customizer-number').getBoundingClientRect();const nt=document.querySelector('[data-preview-name-text]');const dt=document.querySelector('[data-preview-number-text]');const ntb=nt.getBoundingClientRect();const dtb=dt.getBoundingClientRect();rows.push({font:option.value,name:{width:Math.round(ntb.width),height:Math.round(ntb.height),placementCenterDelta:Math.round((n.left+n.width/2)-(art.left+art.width/2)),scale:getComputedStyle(nt).getPropertyValue('--font-visual-scale').trim(),correction:getComputedStyle(nt).getPropertyValue('--font-center-correction').trim()},number:{width:Math.round(dtb.width),height:Math.round(dtb.height),placementCenterDelta:Math.round((d.left+d.width/2)-(art.left+art.width/2)),scale:getComputedStyle(dt).getPropertyValue('--font-visual-scale').trim(),correction:getComputedStyle(dt).getPropertyValue('--font-center-correction').trim()}});}
  select.value='Deportiva';select.dispatchEvent(new Event('change',{bubbles:true}));return rows;
})()`);
const fontSportScreenshotPath=join(tmpdir(),'fdl-customizer-sport-390.png');
await writeFile(fontSportScreenshotPath,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
await evaluate(`(()=>{const select=document.querySelector('#custom-font');select.value='Clásica';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(50);
const fontScreenshotPath=join(tmpdir(),'fdl-customizer-classic-390.png');
await writeFile(fontScreenshotPath,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

console.log(JSON.stringify({initial,colorDeleteChoice,categoryBehavior,customization,preview,viewports,normalizedOff,createFlow,noColorFlow,publicData,emptyPublic,validPublicCustomization,fontMetrics,runtimeErrors,consoleErrors,screenshotPath,fontSportScreenshotPath,fontScreenshotPath},null,2));
socket.close();
