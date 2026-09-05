import { getPaymentMethods, validateCart } from '../lib/api.js';
import { loadSettings } from '../components/layout.js';
import { toast } from '../components/toast.js';
import { $, emptyState, escapeHtml, formatMoney, setButtonLoading } from '../lib/helpers.js';
import { clearCart, getCart, setCart } from '../lib/store.js';

export async function initCheckout() {
  let cart=getCart();
  if(!cart.length){$('.checkout-page').innerHTML=emptyState('Tu carrito está vacío','Agrega productos antes de finalizar el pedido.');return;}
  const [methods,settings]=await Promise.all([getPaymentMethods(),loadSettings()]);
  $('#payment-methods').innerHTML=methods.map((method,index)=>`<label class="radio-option"><input type="radio" name="payment" value="${escapeHtml(method.name)}" ${index===0?'required':''}><span><strong>${escapeHtml(method.name)}</strong><small>${escapeHtml(method.instructions||'La tienda confirmará los detalles.')}</small></span></label>`).join('');
  renderSummary(cart);
  $('#delivery-method').addEventListener('change',event=>{const needs=event.target.value==='Domicilio'||event.target.value==='Envío nacional';$('#address-field').hidden=!needs;$('#address-field input').required=needs;});
  $('#checkout-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=event.submitter;setButtonLoading(button,true,'Verificando stock…');
    try{
      const validation=await validateCart(cart);
      const missing=cart.filter(item=>!validation.some(row=>row.variant_id===item.variant_id));
      const invalid=validation.filter(row=>!row.valid);
      if(missing.length||invalid.length){const reasons=[...invalid.map(row=>`${row.product_name||'Producto'}: ${row.reason}`),...missing.map(item=>`${item.name}: ya no está disponible.`)];toast(reasons[0],'error',6000);setButtonLoading(button,false);return;}
      let priceChanged=false;
      cart=cart.map(item=>{const fresh=validation.find(row=>row.variant_id===item.variant_id);if(Number(item.price)!==Number(fresh.current_price))priceChanged=true;return{...item,name:fresh.product_name,slug:fresh.product_slug,color:fresh.color_name,size:fresh.size_name,stock:fresh.stock,price:Number(fresh.current_price)};});
      setCart(cart);renderSummary(cart);
      if(priceChanged)toast('Actualizamos el total con los precios vigentes.');
      const data=new FormData(event.currentTarget);
      const message=buildMessage(cart,Object.fromEntries(data),settings);
      if(settings.checkout_behavior==='clear')clearCart();
      location.href=`https://wa.me/${encodeURIComponent(settings.whatsapp)}?text=${encodeURIComponent(message)}`;
    }catch(error){console.error(error);toast('No pudimos verificar el pedido. Intenta nuevamente.','error');setButtonLoading(button,false);}
  });
}

function renderSummary(cart){const total=cart.reduce((sum,item)=>sum+(Number(item.price)+Number(item.personalization_price||0))*item.quantity,0);$('#checkout-summary').innerHTML=`<h2>Tu pedido</h2>${cart.map(item=>`<div class="summary-line"><span>${item.quantity}× ${escapeHtml(item.name)}<small style="display:block">${escapeHtml(item.color)} / ${escapeHtml(item.size)}</small></span><strong>${formatMoney((Number(item.price)+Number(item.personalization_price||0))*item.quantity)}</strong></div>`).join('')}<div class="summary-line summary-line--total"><span>Total</span><strong>${formatMoney(total)}</strong></div>`;}

function buildMessage(cart,customer,settings){
  const lines=[`⚽ *NUEVO PEDIDO — ${settings.business_name.toUpperCase()}*`,'',`*Cliente:* ${customer.fullName}`,`*Teléfono:* ${customer.phone}`,`*Ciudad:* ${customer.city}`,`*Entrega:* ${customer.delivery}`,customer.address?`*Dirección:* ${customer.address}`:'',`*Pago:* ${customer.payment}`,'','──────────────'];
  cart.forEach((item,index)=>{const unit=Number(item.price)+Number(item.personalization_price||0);lines.push('',`*PRODUCTO ${index+1}*`,item.name,`Color: ${item.color}`,`Talla: ${item.size}`,`Cantidad: ${item.quantity}`,`Precio unitario: ${formatMoney(unit)}`);const custom=item.personalization;if(custom){if(custom.name)lines.push(`Nombre: ${custom.name}`);if(custom.number)lines.push(`Número: ${custom.number}`);if(custom.font)lines.push(`Fuente: ${custom.font}`);if(custom.textColor)lines.push(`Color texto: ${custom.textColor}`);if(custom.namePosition)lines.push(`Posición nombre: ${custom.namePosition}`);if(custom.numberPosition)lines.push(`Posición número: ${custom.numberPosition}`);if(custom.logoPosition)lines.push(`Posición logo: ${custom.logoPosition}`);if(custom.logoUrl)lines.push(`Logo: ${custom.logoUrl}`);}lines.push(`Subtotal: ${formatMoney(unit*item.quantity)}`,`Producto: ${new URL(`producto.html?slug=${encodeURIComponent(item.slug)}`,location.href).href}`);});
  const total=cart.reduce((sum,item)=>sum+(Number(item.price)+Number(item.personalization_price||0))*item.quantity,0);lines.push('','──────────────',`*TOTAL: ${formatMoney(total)}*`,customer.notes?`Observaciones: ${customer.notes}`:'','', 'Por favor confirmar disponibilidad y datos de pago.');return lines.filter(line=>line!== '').reduce((acc,line,index)=>{acc.push(line);if(line==='──────────────'&&index<8)acc.push('');return acc;},[]).join('\n');
}

