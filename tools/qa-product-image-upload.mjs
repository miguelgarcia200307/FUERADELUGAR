const tabs = await fetch('http://localhost:9223/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No se encontró una pestaña para QA.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true });socket.addEventListener('error', reject, { once: true }); });

let id = 0;
const pending = new Map();
const runtimeErrors = [];
const consoleErrors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { const task = pending.get(message.id);pending.delete(message.id);return message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(item => item.description || item.value || '').join(' '));
});
const command = (method, params = {}) => { const requestId = ++id;socket.send(JSON.stringify({ id: requestId, method, params }));return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject })); };
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => { if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);return result.result.value; });

const bootstrap = `(() => {
  const userId='11111111-1111-4111-8111-111111111111';
  const base64=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');
  const token=base64({alg:'none',typ:'JWT'})+'.'+base64({sub:userId,role:'authenticated',exp:4102444800})+'.qa';
  localStorage.setItem('sb-gacqqaimdfvkmznsglpg-auth-token',JSON.stringify({access_token:token,refresh_token:'qa-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'admin@qa.local',role:'authenticated'}}));
  window.__qa={product:null,imageRows:[],uploads:[],failNextStorage:false,primaryUpdates:0};
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?input:input.url;if(!url.includes('gacqqaimdfvkmznsglpg.supabase.co'))return originalFetch(input,options);
    const method=(options.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();const payload=typeof options.body==='string'?JSON.parse(options.body):null;let body=[];
    if(url.includes('/storage/v1/object/product-images')){
      if(window.__qa.failNextStorage){window.__qa.failNextStorage=false;return new Response(JSON.stringify({message:'Storage temporarily unavailable'}),{status:503,headers:{'content-type':'application/json'}});}
      window.__qa.uploads.push({url,type:options.body?.type||'',size:options.body?.size||0});body={Key:'product-images/qa-upload'};
    }else if(url.includes('/rest/v1/admins'))body={user_id:userId};
    else if(url.includes('/rest/v1/categories')||url.includes('/rest/v1/teams')||url.includes('/rest/v1/brands')||url.includes('/rest/v1/payment_methods'))body=[];
    else if(url.includes('/rest/v1/site_settings'))body={id:1,business_name:'Fuera de Lugar Sport',whatsapp:'573001112233',checkout_behavior:'keep'};
    else if(url.includes('/rest/v1/products')){if(method==='POST'||method==='PATCH'){window.__qa.product={id:'product-image-qa',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...payload,product_categories:[],product_colors:[],product_sizes:[],product_variants:[],product_images:window.__qa.imageRows};body=window.__qa.product;}else body=window.__qa.product?[window.__qa.product]:[];}
    else if(url.includes('/rest/v1/product_categories'))body=payload||[];
    else if(url.includes('/rest/v1/product_colors'))body=[];
    else if(url.includes('/rest/v1/product_sizes'))body=method==='GET'?[]:{id:'size-image-qa',product_id:'product-image-qa',...payload};
    else if(url.includes('/rest/v1/product_variants'))body=payload||[];
    else if(url.includes('/rest/v1/product_images')){if(method==='POST'){const row={id:'image-'+(window.__qa.imageRows.length+1),...payload};window.__qa.imageRows.push(row);body=row;}else if(method==='PATCH'){if(payload?.is_primary===true)window.__qa.primaryUpdates+=1;body=payload||{};}else body=window.__qa.imageRows;}
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json','content-range':'0-0/1'}});
  };
})()`;

await command('Runtime.enable');await command('Page.enable');await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});
await command('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap});
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await command('Page.navigate',{url:'http://localhost:8080/admin/index.html?section=products'});await delay(1300);

const result = await evaluate(`(async()=>{
  document.querySelector('#new-product').click();await new Promise(resolve=>setTimeout(resolve,50));const form=document.querySelector('.product-editor');
  form.elements.name.value='Producto con fotos móviles';form.elements.base_price.value='129000';form.elements.status.value='published';form.querySelector('#add-size').click();form.querySelector('#admin-sizes input').value='Única';form.querySelector('#admin-sizes input').dispatchEvent(new Event('change',{bubbles:true}));
  const makeFile=async({width,height,name,noise=false,seedStart=987654321})=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(noise){const image=context.createImageData(width,height);let seed=seedStart;for(let index=0;index<image.data.length;index+=4){seed=(seed*1664525+1013904223)>>>0;image.data[index]=seed&255;image.data[index+1]=(seed>>>8)&255;image.data[index+2]=(seed>>>16)&255;image.data[index+3]=255;}context.putImageData(image,0,0);}else{context.fillStyle='#168a4c';context.fillRect(0,0,width,height);}const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',noise?1:.86));canvas.width=canvas.height=0;return new File([blob],name,{type:'image/jpeg'});};
  const heavy=await makeFile({width:2800,height:2000,name:'camara-celular.jpg',noise:true});const heavySecond=await makeFile({width:2700,height:1900,name:'camara-celular-2.jpg',noise:true,seedStart:246813579});const small=await makeFile({width:800,height:600,name:'detalle.jpg'});const transfer=new DataTransfer();transfer.items.add(heavy);transfer.items.add(heavySecond);transfer.items.add(small);form.querySelector('#product-files').files=transfer.files;form.querySelector('#product-files').dispatchEvent(new Event('change',{bubbles:true}));
  const immediate={cards:form.querySelectorAll('.photo-card').length,statuses:[...form.querySelectorAll('.photo-card__status')].map(node=>node.textContent),submitDisabled:form.querySelector('.form-actions [type="submit"]').disabled,previewBlob:[...form.querySelectorAll('.photo-card img')].every(image=>image.src.startsWith('blob:')),overflow:document.querySelector('.modal--product').scrollWidth>document.querySelector('.modal--product').clientWidth};
  for(let attempt=0;attempt<160;attempt+=1){if(!form.querySelector('.photo-card--busy'))break;await new Promise(resolve=>setTimeout(resolve,50));}
  const prepared={statuses:[...form.querySelectorAll('.photo-card__status')].map(node=>node.textContent),details:[...form.querySelectorAll('.photo-card__detail')].map(node=>node.textContent),submitDisabled:form.querySelector('.form-actions [type="submit"]').disabled,progress:form.querySelector('#photo-progress').textContent};
  window.__qa.failNextStorage=true;form.requestSubmit();
  for(let attempt=0;attempt<80;attempt+=1){if(form.querySelector('.photo-card__status--error'))break;await new Promise(resolve=>setTimeout(resolve,50));}
  const failed={formOpen:Boolean(document.querySelector('.product-editor')),error:form.querySelector('.photo-card__status--error')?.textContent,detail:form.querySelector('.photo-card__status--error')?.nextElementSibling?.textContent,retry:Boolean(form.querySelector('[data-retry-photo]')),completed:[...form.querySelectorAll('.photo-card__status--loaded')].length,rows:window.__qa.imageRows.length};
  form.querySelector('[data-retry-photo]').click();
  for(let attempt=0;attempt<120;attempt+=1){if(!document.querySelector('.product-editor'))break;await new Promise(resolve=>setTimeout(resolve,50));}
  return{immediate,prepared,failed,final:{closed:!document.querySelector('.product-editor'),product:window.__qa.product&&{name:window.__qa.product.name,status:window.__qa.product.status},imageRows:window.__qa.imageRows,uploads:window.__qa.uploads,primaryUpdates:window.__qa.primaryUpdates}};
})()`);

const failures=[];const expect=(condition,message)=>{if(!condition)failures.push(message);};
expect(result.immediate.cards===3&&result.immediate.submitDisabled&&result.immediate.previewBlob,'No se mostró la preparación inmediata de tres fotos.');
expect(result.prepared.statuses.every(status=>status==='Lista para subir')&&!result.prepared.submitDisabled,'Las fotos no quedaron listas antes de guardar.');
expect(result.prepared.details.filter(detail=>detail.includes('→')).length===2&&result.prepared.details.some(detail=>detail.includes('Sin cambios')),'No se procesaron secuencialmente dos fotos pesadas y una adecuada.');
expect(result.failed.formOpen&&result.failed.retry&&result.failed.completed===2,'El fallo aislado no conservó el formulario y las otras fotos.');
expect(result.failed.detail?.includes('almacenamiento'),'No se mostró un error claro de Storage.');
expect(result.final.closed&&result.final.imageRows.length===3&&result.final.uploads.length===3,'El reintento no completó las tres fotografías.');
expect(result.final.primaryUpdates>0,'No se conservó una imagen principal global.');
expect(result.final.imageRows.filter(row=>row.alt_text.endsWith('.webp')).length===2&&result.final.imageRows.some(row=>row.alt_text.endsWith('.jpg')),'Los registros no conservaron formatos coherentes WebP/JPEG.');
expect(result.final.uploads.every(upload=>/\.(webp|jpg)$/.test(decodeURIComponent(upload.url))),'La extensión de Storage no coincide con el formato.');
expect(!result.immediate.overflow,'El formulario tiene desbordamiento horizontal en móvil.');
expect(runtimeErrors.length===0,'Hubo excepciones de navegador.');

console.log(JSON.stringify({result,runtimeErrors,consoleErrors,failures},null,2));socket.close();if(failures.length)process.exitCode=1;
