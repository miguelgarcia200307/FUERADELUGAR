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

await command('Runtime.enable');
await command('Page.enable');
await command('Page.navigate', { url: 'http://localhost:8080/index.html' });
await delay(500);

const results = await evaluate(`(async()=>{
  const imageTools=await import('/js/lib/image-processor.js');
  const toBlob=(canvas,type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
  const makeFile=async({width,height,type='image/jpeg',quality=.9,name='foto.jpg',noise=false,alpha=false})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');
    if(noise){const image=context.createImageData(width,height);let seed=123456789;for(let index=0;index<image.data.length;index+=4){seed=(seed*1664525+1013904223)>>>0;image.data[index]=seed&255;image.data[index+1]=(seed>>>8)&255;image.data[index+2]=(seed>>>16)&255;image.data[index+3]=255;}context.putImageData(image,0,0);}
    else{context.fillStyle=alpha?'rgba(20,140,80,.45)':'#168a4c';context.fillRect(0,0,width,height);context.fillStyle='#ffffff';context.font=Math.max(24,Math.round(width/12))+'px sans-serif';context.fillText('Fuera de Lugar',width*.08,height*.52);}
    const blob=await toBlob(canvas,type,quality);canvas.width=canvas.height=0;return new File([blob],name,{type:blob.type,lastModified:1700000000000});
  };
  const injectOrientation=async(file,orientation)=>{const source=new Uint8Array(await file.arrayBuffer());const exif=Uint8Array.from([0xff,0xe1,0x00,0x22,0x45,0x78,0x69,0x66,0,0,0x49,0x49,0x2a,0,8,0,0,0,1,0,0x12,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);const output=new Uint8Array(source.length+exif.length);output.set(source.subarray(0,2));output.set(exif,2);output.set(source.subarray(2),2+exif.length);return new File([output],'vertical-celular.jpg',{type:'image/jpeg',lastModified:file.lastModified});};
  const summary=result=>({optimized:result.optimized,originalBytes:result.originalBytes,finalBytes:result.finalBytes,original:[result.originalWidth,result.originalHeight],final:[result.finalWidth,result.finalHeight],type:result.file.type,name:result.file.name});

  const small=await imageTools.prepareProductImage(await makeFile({width:800,height:600,name:'pequena.jpg'}));
  const heavyFile=await makeFile({width:2800,height:2000,quality:1,name:'camara-celular.jpg',noise:true});
  const heavy=await imageTools.prepareProductImage(heavyFile);
  const transparent=await imageTools.prepareProductImage(await makeFile({width:3000,height:1800,type:'image/png',name:'transparente.png',alpha:true}));
  const transparentBitmap=await createImageBitmap(transparent.file);const alphaCanvas=document.createElement('canvas');alphaCanvas.width=alphaCanvas.height=1;const alphaContext=alphaCanvas.getContext('2d');alphaContext.drawImage(transparentBitmap,0,0,1,1);const transparentAlpha=alphaContext.getImageData(0,0,1,1).data[3];transparentBitmap.close();
  const webp=await imageTools.prepareProductImage(await makeFile({width:900,height:600,type:'image/webp',name:'catalogo.webp'}));
  const landscape=await makeFile({width:1600,height:900,name:'celular.jpg'});
  const orientedFile=await injectOrientation(landscape,6);
  const inspectedOrientation=await imageTools.inspectImageFile(orientedFile);
  const oriented=await imageTools.prepareProductImage(orientedFile);
  const duplicateA=await imageTools.imageFingerprint(small.file);const duplicateB=await imageTools.imageFingerprint(new File([small.file],small.file.name,{type:small.file.type,lastModified:small.file.lastModified}));
  const errors={};
  for(const [key,file] of [
    ['notImage',new File(['MZ executable'],'foto.jpg',{type:'image/jpeg'})],
    ['corrupt',new File([Uint8Array.from([255,216,255,217])],'rota.jpg',{type:'image/jpeg'})],
    ['mismatch',new File([await (await makeFile({width:20,height:20,type:'image/png',name:'x.png'})).arrayBuffer()],'falsa.png',{type:'image/jpeg'})],
    ['heic',new File([Uint8Array.from([0,0,0,24,102,116,121,112,104,101,105,99,0,0,0,0,109,105,102,49,104,101,105,99])],'iphone.heic',{type:'image/heic'})]
  ]){try{await imageTools.prepareProductImage(file);errors[key]='accepted';}catch(error){errors[key]={code:error.code,message:imageTools.imageProcessingMessage(error)};}}
  return{limits:imageTools.IMAGE_LIMITS,small:summary(small),heavy:summary(heavy),heavySourceBytes:heavyFile.size,transparent:{...summary(transparent),sampleAlpha:transparentAlpha},webp:summary(webp),orientation:{detected:inspectedOrientation.orientation,...summary(oriented)},duplicateFingerprint:duplicateA===duplicateB,errors};
})()`);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
expect(results.small.optimized === false, 'La JPG pequeña no debería recomprimirse.');
expect(results.heavy.optimized === true && results.heavy.finalBytes < results.heavySourceBytes, 'La fotografía pesada no se redujo.');
expect(Math.max(...results.heavy.final) <= 2560, 'La fotografía pesada excede 2560 px.');
expect(results.heavy.finalBytes <= results.limits.maxOutputBytes, 'La salida pesada excede el máximo seguro.');
expect(results.transparent.type === 'image/webp' && Math.max(...results.transparent.final) <= 2560, 'La PNG grande/transparente no se convirtió correctamente.');
expect(results.transparent.sampleAlpha > 0 && results.transparent.sampleAlpha < 255, 'La transparencia de PNG no se conservó.');
expect(results.webp.optimized === false && results.webp.type === 'image/webp', 'La WebP adecuada se modificó innecesariamente.');
expect(results.orientation.detected === 6 && results.orientation.final[1] > results.orientation.final[0], 'No se corrigió la orientación EXIF vertical.');
expect(results.duplicateFingerprint, 'No se detectó un duplicado idéntico.');
expect(results.errors.notImage.code === 'unsupported-format', 'Se aceptó un archivo que no era imagen.');
expect(results.errors.corrupt.code === 'corrupt', 'No se detectó la imagen corrupta.');
expect(results.errors.mismatch.code === 'mime-mismatch', 'No se detectó la incoherencia MIME/contenido.');
expect(results.errors.heic.code === 'heic-unsupported', 'HEIC sin decodificador no produjo el mensaje específico.');
expect(runtimeErrors.length === 0, 'Se registraron excepciones de navegador.');

console.log(JSON.stringify({ ...results, runtimeErrors, failures }, null, 2));
socket.close();
if (failures.length) process.exitCode = 1;
