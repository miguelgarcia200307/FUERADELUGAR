import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const screenshots={admin:join(tmpdir(),'fdl-announcement-admin.png'),store:join(tmpdir(),'fdl-announcement-store.png')};
const tabs=await fetch('http://localhost:9223/json/list').then(response=>response.json());
const page=tabs.find(tab=>tab.type==='page');
if(!page)throw new Error('No se encontró una pestaña para QA.');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=0;const pending=new Map();const runtimeErrors=[];
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const task=pending.get(message.id);pending.delete(message.id);return message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')runtimeErrors.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text||'Runtime exception');});
const command=(method,params={})=>{const requestId=++id;socket.send(JSON.stringify({id:requestId,method,params}));return new Promise((resolve,reject)=>pending.set(requestId,{resolve,reject}));};
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const evaluate=expression=>command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).then(result=>{if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;});

const bootstrap=`(() => {
  const userId='11111111-1111-4111-8111-111111111111';
  const base64=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');
  const token=base64({alg:'none',typ:'JWT'})+'.'+base64({sub:userId,role:'authenticated',exp:4102444800})+'.qa';
  localStorage.setItem('sb-gacqqaimdfvkmznsglpg-auth-token',JSON.stringify({access_token:token,refresh_token:'qa-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'admin@qa.local',role:'authenticated'}}));
  const defaults={id:1,business_name:'Fuera de Lugar Sport',whatsapp:'573001112233',checkout_behavior:'keep',announcement_enabled:true,announcement_mode:'static',announcement_static_text:'Compra por WhatsApp • Atención personalizada • Valledupar',announcement_interval_seconds:5,announcement_messages:[{id:'one',text:'Compra por WhatsApp',enabled:true,position:1},{id:'two',text:'Atención personalizada',enabled:true,position:2},{id:'three',text:'Valledupar',enabled:true,position:3}]};
  let settings=JSON.parse(localStorage.getItem('qa-announcement-settings')||'null')||defaults;window.__qaSaves=0;window.__qaSettings=settings;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?input:input.url;if(!url.includes('gacqqaimdfvkmznsglpg.supabase.co'))return originalFetch(input,options);
    const method=(options.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();let body=[];
    if(url.includes('/rest/v1/admins'))body={user_id:userId};
    else if(url.includes('/rest/v1/site_settings')){if(localStorage.getItem('qa-announcement-load-fail'))return new Response(JSON.stringify({message:'QA load failure'}),{status:503,headers:{'content-type':'application/json'}});if(method==='PATCH'){await new Promise(resolve=>setTimeout(resolve,120));if(localStorage.getItem('qa-announcement-save-fail'))return new Response(JSON.stringify({message:'QA save failure'}),{status:500,headers:{'content-type':'application/json'}});Object.assign(settings,JSON.parse(options.body||'{}'));window.__qaSaves++;localStorage.setItem('qa-announcement-settings',JSON.stringify(settings));}body=settings;}
    else if(url.includes('/rest/v1/products'))body=[];
    else if(url.includes('/rest/v1/categories')||url.includes('/rest/v1/teams')||url.includes('/rest/v1/brands')||url.includes('/rest/v1/payment_methods')||url.includes('/rest/v1/product_colors')||url.includes('/rest/v1/product_sizes'))body=[];
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json','content-range':'0-0/0'}});
  };
})()`;

await command('Runtime.enable');await command('Page.enable');await command('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap});
await evaluate(`localStorage.removeItem('qa-announcement-settings')`);
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await command('Page.navigate',{url:'http://localhost:8080/admin/index.html?section=settings'});await delay(2600);

const initial=await evaluate(`(()=>({title:document.querySelector('.admin-heading h1')?.textContent,block:document.querySelector('#announcement-settings-title')?.textContent,enabled:document.querySelector('[name="announcement_enabled"]')?.checked,mode:document.querySelector('[name="announcement_mode"]:checked')?.value,staticText:document.querySelector('#announcement-static-text')?.value,preview:document.querySelector('[data-announcement-preview]')?.textContent.trim(),separators:document.querySelectorAll('[data-announcement-preview] i').length,messages:document.querySelectorAll('.announcement-message').length,overflow:document.documentElement.scrollWidth>innerWidth}))()`);

await evaluate(`(async()=>{const input=document.querySelector('#announcement-static-text');input.value='  Domicilio gratis hoy  ';input.dispatchEvent(new Event('input',{bubbles:true}));const form=document.querySelector('#settings-form'),button=form.querySelector('[type="submit"]');form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));await new Promise(resolve=>setTimeout(resolve,260));})()`);
await command('Page.reload');await delay(2200);
const staticPersistence=await evaluate(`(()=>({mode:document.querySelector('[name="announcement_mode"]:checked')?.value,value:document.querySelector('#announcement-static-text')?.value,preview:document.querySelector('[data-announcement-preview]')?.textContent.trim(),stored:window.__qaSettings.announcement_static_text}))()`);

const edited=await evaluate(`(async()=>{
  const carousel=document.querySelector('[name="announcement_mode"][value="carousel"]');carousel.click();
  const inputs=[...document.querySelectorAll('[data-message-text]')];inputs[0].value='<img src=x onerror=window.__announcementXss=1>';inputs[0].dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelectorAll('.announcement-item-toggle input')[1].click();
  document.querySelector('#add-announcement-message').click();const added=[...document.querySelectorAll('[data-message-text]')].at(-1);added.value='Oferta final';added.dispatchEvent(new Event('input',{bubbles:true}));
  const interval=document.querySelector('#announcement-interval');interval.value='2';interval.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,30));
  const first=document.querySelector('[data-announcement-preview]').textContent.trim();await new Promise(resolve=>setTimeout(resolve,2200));const second=document.querySelector('[data-announcement-preview]').textContent.trim();
  return{messageCount:document.querySelectorAll('.announcement-message').length,inactive:document.querySelectorAll('.announcement-item-toggle input')[1].checked===false,counter:inputs[0].nextElementSibling.textContent,first,second,xss:window.__announcementXss||0,injected:document.querySelector('[data-announcement-preview] img')!==null};
})()`);

const validation=await evaluate(`(async()=>{const form=document.querySelector('#settings-form');const button=form.querySelector('[type="submit"]');const interval=document.querySelector('#announcement-interval');interval.value='1';form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));await new Promise(resolve=>setTimeout(resolve,30));const result={message:document.querySelector('#announcement-form-error').textContent,invalid:interval.getAttribute('aria-invalid'),saves:window.__qaSaves};interval.value='2';interval.dispatchEvent(new Event('input',{bubbles:true}));return result;})()`);

const timerBehavior=await evaluate(`(async()=>{
  const originalSet=window.setInterval.bind(window),originalClear=window.clearInterval.bind(window);const active=new Set();let created=0;
  window.setInterval=(callback,ms)=>{const timer=originalSet(callback,ms);active.add(timer);created++;return timer;};window.clearInterval=timer=>{active.delete(timer);return originalClear(timer);};
  const toggles=[...document.querySelectorAll('.announcement-item-toggle input')];toggles.forEach((toggle,index)=>{if(index===0){if(!toggle.checked)toggle.click();}else if(toggle.checked)toggle.click();});created=0;document.querySelector('#announcement-interval').dispatchEvent(new Event('input',{bubbles:true}));const oneActiveCreated=created;
  toggles[2].click();created=0;document.querySelector('#announcement-interval').dispatchEvent(new Event('input',{bubbles:true}));const multipleCreated=created;
  document.querySelector('[data-section="dashboard"]').click();await new Promise(resolve=>setTimeout(resolve,180));const afterNavigation=active.size;
  window.setInterval=originalSet;window.clearInterval=originalClear;return{oneActiveCreated,multipleCreated,afterNavigation,previewRemoved:!document.querySelector('[data-announcement-preview]')};
})()`);

await evaluate(`document.querySelector('[data-section="settings"]').click()`);await delay(250);
const save=await evaluate(`(async()=>{
  document.querySelector('[name="announcement_mode"][value="carousel"]').click();const inputs=[...document.querySelectorAll('[data-message-text]')];
  inputs[0].value='Primero';inputs[0].dispatchEvent(new Event('input',{bubbles:true}));inputs[1].value='No mostrar';inputs[1].dispatchEvent(new Event('input',{bubbles:true}));inputs[2].value='Segundo';inputs[2].dispatchEvent(new Event('input',{bubbles:true}));
  const toggles=[...document.querySelectorAll('.announcement-item-toggle input')];if(!toggles[0].checked)toggles[0].click();if(toggles[1].checked)toggles[1].click();if(!toggles[2].checked)toggles[2].click();
  document.querySelector('[data-message-id="three"] .announcement-order button:first-child').click();document.querySelector('[data-message-id="three"] .announcement-order button:first-child').click();
  document.querySelector('#announcement-interval').value='2';const form=document.querySelector('#settings-form'),button=form.querySelector('[type="submit"]');form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));await new Promise(resolve=>setTimeout(resolve,260));
  return{saves:window.__qaSaves,stored:window.__qaSettings.announcement_messages,interval:window.__qaSettings.announcement_interval_seconds,buttonDisabled:button.disabled,toast:document.querySelector('.toast')?.textContent};
})()`);

await command('Page.reload');await delay(2200);
const persisted=await evaluate(`(()=>({mode:document.querySelector('[name="announcement_mode"]:checked')?.value,interval:document.querySelector('#announcement-interval')?.value,messages:[...document.querySelectorAll('[data-message-text]')].map(input=>input.value),enabled:[...document.querySelectorAll('.announcement-item-toggle input')].map(input=>input.checked)}))()`);
await writeFile(screenshots.admin,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
const saveFailure=await evaluate(`(async()=>{localStorage.setItem('qa-announcement-save-fail','1');const input=document.querySelector('[data-message-text]');input.value='Texto que debe conservarse';input.dispatchEvent(new Event('input',{bubbles:true}));const form=document.querySelector('#settings-form'),button=form.querySelector('[type="submit"]');form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));await new Promise(resolve=>setTimeout(resolve,260));localStorage.removeItem('qa-announcement-save-fail');return{value:input.value,errorToast:[...document.querySelectorAll('.toast')].at(-1)?.textContent,stored:JSON.parse(localStorage.getItem('qa-announcement-settings')).announcement_messages[0].text};})()`);
await command('Page.navigate',{url:'http://localhost:8080/index.html'});await delay(2600);
const publicCarousel=await evaluate(`(async()=>{const root=document.querySelector('[data-announcement]');const first=root?.textContent.trim();await new Promise(resolve=>setTimeout(resolve,2200));const second=root?.textContent.trim();await new Promise(resolve=>setTimeout(resolve,2200));const third=root?.textContent.trim();return{exists:Boolean(root),first,second,third,inactiveNeverShown:![first,second,third].includes('No mostrar'),htmlNodes:root?.querySelectorAll('script,img').length||0,headerTop:document.querySelector('.site-header')?.getBoundingClientRect().top};})()`);

const responsive=[];for(const [width,height] of [[320,568],[390,844],[768,1024],[1366,768],[1920,1080]]){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});await delay(80);responsive.push(await evaluate(`(()=>{const bar=document.querySelector('[data-announcement]');return{size:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,height:bar?.getBoundingClientRect().height,textOverflow:bar?bar.scrollWidth>bar.clientWidth:false}})()`));}
await writeFile(screenshots.store,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

const directController=await evaluate(`(async()=>{const module=await import('/js/lib/announcement.js');const root=document.createElement('aside');document.body.append(root);let calls=0;const original=window.setInterval;window.setInterval=(...args)=>{calls++;return original(...args);};const one=module.createAnnouncementController(root,{announcement_enabled:true,announcement_mode:'carousel',announcement_interval_seconds:2,announcement_messages:[{id:'a',text:'Único',enabled:true,position:1},{id:'b',text:'Oculto',enabled:false,position:2}]});const oneCalls=calls;one.stop();calls=0;const many=module.createAnnouncementController(root,{announcement_enabled:true,announcement_mode:'carousel',announcement_interval_seconds:2,announcement_messages:[{id:'a',text:'Uno',enabled:true,position:1},{id:'b',text:'Dos',enabled:true,position:2}]});const manyCalls=calls;many.stop();window.setInterval=original;root.remove();return{oneCalls,manyCalls,textAfterOne:'Único'};})()`);

await evaluate(`localStorage.setItem('qa-announcement-settings',JSON.stringify({...window.__qaSettings,announcement_enabled:false}))`);await command('Page.reload');await delay(1800);
const hidden=await evaluate(`(()=>({barExists:Boolean(document.querySelector('[data-announcement]')),headerTop:document.querySelector('.site-header')?.getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth}))()`);

await evaluate(`localStorage.setItem('qa-announcement-load-fail','1');localStorage.removeItem('qa-announcement-settings')`);await command('Page.reload');await delay(3500);
const fallback=await evaluate(`(()=>({barExists:Boolean(document.querySelector('[data-announcement]')),text:document.querySelector('[data-announcement]')?.textContent.trim(),separators:document.querySelectorAll('[data-announcement] i').length,mainLoaded:Boolean(document.querySelector('main'))}))()`);
await evaluate(`localStorage.removeItem('qa-announcement-load-fail')`);

console.log(JSON.stringify({initial,staticPersistence,edited,validation,timerBehavior,save,persisted,saveFailure,publicCarousel,responsive,directController,hidden,fallback,runtimeErrors,screenshots},null,2));socket.close();
