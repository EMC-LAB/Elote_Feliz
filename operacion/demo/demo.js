(()=>{'use strict';
const $=s=>document.querySelector(s),E=s=>document.createElement(s),fmt=n=>'$'+(Number(n||0)/100).toLocaleString('es-MX',{maximumFractionDigits:2}),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,catalog=[],dashboard=null,timer=null,loginActive=false;const $notify=(message,error=false)=>{const n=$('#notice');n.hidden=false;n.textContent=message;n.style.background=error?'#ffe0e9':'#fff0d4';setTimeout(()=>{n.hidden=true},7000)};

/* SOLO DEMOSTRACIÓN: no usa una base de datos, servidor autenticado ni Meta WhatsApp. */
const DEMO_KEY='elote_feliz_panels_demo_v1';
const PRODUCT_SEED=[
 {id:'elote',name:'Elote',category:'elotes',price_cents:4000,available:true},
 {id:'esquite',name:'Esquite',category:'esquites',price_cents:4000,available:true},
 {id:'revolcado',name:'Elote revolcado',category:'especialidades',price_cents:8000,available:true,extra_topoki_cents:2000},
 {id:'tostiesquite',name:'Tostitos',category:'especialidades',price_cents:6000,available:true},
 {id:'buldak',name:'Buldak con esquite',category:'especialidades',price_cents:12000,available:true}
];
const initial=()=>({products:PRODUCT_SEED.map(x=>({...x})),orders:[],inbox:[],inventory:[],staff:[],nextId:1});
function retrieve(){try{const obj=JSON.parse(localStorage.getItem(DEMO_KEY));if(obj&&Array.isArray(obj.orders)&&Array.isArray(obj.products)&&Array.isArray(obj.inventory)&&Array.isArray(obj.inbox))return obj}catch{}return initial()}
let localData=retrieve();
const save=()=>{try{localStorage.setItem(DEMO_KEY,JSON.stringify(localData))}catch{}};
const parseBody=opts=>{try{return JSON.parse(opts.body||'{}')}catch{return {}}};
const ownerRole=()=>{if(user?.role!=='owner')throw Error('Esta acción está reservada a Kas (demo)')};
const requireSession=()=>{if(!user)throw Error('Inicia sesión')};
const newId=()=>String(localData.nextId++);
function createDemoOrder(items,source,customerName,notes){
 requireSession();
 if(!Array.isArray(items)||!items.length)throw Error('Selecciona al menos un producto');
 const lines=[];let total=0;
 for(const x of items){
  const p=localData.products.find(y=>y.id===x.id&&y.available);
  const qty=Number(x.qty);
  if(!p||!Number.isInteger(qty)||qty<1||qty>30)throw Error('Producto o cantidad incorrecta');
  total+=p.price_cents*qty;
  lines.push({name:p.name,qty,unit_cents:p.price_cents});
 }
 if(total>1000000)throw Error('Pedido demasiado grande');
 const id=newId();
 const row={id,created_at:new Date().toISOString(),source,customer_name:String(customerName||'').slice(0,65),status:'nuevo',payment_state:'pendiente',payment_method:null,total_cents:total,notes:String(notes||'').slice(0,250),lines,products:lines.map(x=>x.qty+'× '+x.name).join(', '),refund_required:false};
 localData.orders.unshift(row);localData.orders=localData.orders.slice(0,150);save();
 return {id,folio:'Felicidad #'+id.padStart(4,'0')+' (DEMO)',total_cents:total,total:total/100};
}
function getDashboard(days){
 const now=Date.now(),since=now-days*86400000;
 const all=localData.orders.filter(x=>Date.parse(x.created_at)>=since);
 const live=all.filter(x=>x.status!=='cancelado');
 const paid=live.filter(x=>x.payment_state==='pagado');
 const total=paid.reduce((sum,x)=>sum+x.total_cents,0);
 const series=Array.from({length:30},(_,i)=>{
  const d=new Date();d.setDate(d.getDate()-29+i);
  const date=d.toLocaleDateString('en-CA');
  const sales=localData.orders.filter(o=>o.status!=='cancelado'&&o.payment_state==='pagado'&&o.paid_at?.slice(0,10)===date).reduce((sum,o)=>sum+o.total_cents,0);
  return {date,sales_cents:sales};
 });
 const counts=new Map();
 localData.orders.filter(o=>o.status!=='cancelado'&&o.payment_state==='pagado').forEach(o=>o.lines.forEach(x=>counts.set(x.name,(counts.get(x.name)||0)+x.qty)));
 return {role:user.role,name:user.name,metrics:{paid_count:paid.length,revenue_cents:total,order_count:live.length,cancelled_count:all.filter(x=>x.status==='cancelado').length},
 orders:localData.orders.slice(0,150),daysChart:series,top:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([product_name,quantity])=>({product_name,quantity})),
 inbox:localData.inbox,inventory:localData.inventory};
}
async function api(path,options={}){
 const body=parseBody(options);
 if(path==='health')return {server:true,database:true,live:false,demo:true};
 if(path==='login'){
  if(body.password!=='elote123')throw Error('Contraseña incorrecta. Clave de demo: elote123');
  const role=body.role==='owner'?'owner':'staff';
  const response={name:role==='owner'?'Kas':'Encargado',role};
  try{sessionStorage.setItem('ef_demo_role',role)}catch{}
  return response;
 }
 if(path==='logout'){try{sessionStorage.removeItem('ef_demo_role')}catch{}return {ok:true}}
 if(path==='me'){
  let role=null;try{role=sessionStorage.getItem('ef_demo_role')}catch{}
  if(!['owner','staff'].includes(role))throw Error('Inicia sesión');
  return {name:role==='owner'?'Kas':'Encargado',role};
 }
 requireSession();
 if(path==='products')return localData.products;
 if(path.startsWith('dashboard'))return getDashboard(Math.min(30,Math.max(1,Number(new URLSearchParams(path.split('?')[1]).get('days'))||1)));
 if(path==='orders/counter')return createDemoOrder(body.items,'mostrador',body.customerName,body.notes);
 if(path==='demo/inbox'){
  const seq=String(localData.inbox.length+1);
  const message={message_id:'demo-'+Date.now()+'-'+seq,customer_name:'Cliente de prueba',from_phone:'DEMO',content:'Hola, quiero pedir 2 elotes. ¿Me confirman disponibilidad?',received_at:new Date().toISOString(),reviewed:false};
  localData.inbox.unshift(message);save();return message;
 }
 const match=path.match(/^orders\/(\d+)\/(status|pay|cancel)$/);
 if(match){
  const order=localData.orders.find(o=>String(o.id)===match[1]);
  if(!order||order.status==='cancelado')throw Error('El pedido no está disponible');
  if(match[2]==='status'){
   if(!['confirmado','preparando','listo','entregado'].includes(body.status))throw Error('Estado no válido');
   order.status=body.status;
  }else if(match[2]==='pay'){
   if(order.payment_state==='pagado')throw Error('El pedido ya está pagado');
   if(!['efectivo','transferencia','tarjeta'].includes(body.method))throw Error('Método incorrecto');
   order.payment_state='pagado';order.payment_method=body.method;order.paid_at=new Date().toISOString();
  }else{
   ownerRole();if(String(body.reason||'').trim().length<5)throw Error('Motivo de al menos 5 caracteres');
   order.status='cancelado';order.cancel_reason=String(body.reason).slice(0,250);order.refund_required=order.payment_state==='pagado';
  }
  save();return order;
 }
 const review=path.match(/^whatsapp\/(.+)\/review$/);
 if(review){const msg=localData.inbox.find(m=>m.message_id===decodeURIComponent(review[1]));if(msg){msg.reviewed=true;save()}return msg}
 const prod=path.match(/^products\/(.+)$/);
 if(prod){
  ownerRole();const item=localData.products.find(p=>p.id===prod[1]);if(!item)throw Error('Producto no encontrado');
  if(body.price!==undefined){if(!Number.isFinite(+body.price)||+body.price<0||+body.price>10000)throw Error('Precio incorrecto');item.price_cents=Math.round(+body.price*100)}
  if(typeof body.available==='boolean')item.available=body.available;
  save();return item;
 }
 if(path==='inventory'){
  ownerRole();const name=String(body.name||'').trim();
  if(!name)throw Error('Escribe nombre del insumo');
  const row={id:'i'+newId(),name,unit:String(body.unit||'pieza'),quantity:Number(body.quantity)||0,minimum:0};
  localData.inventory.push(row);save();return row;
 }
 const move=path.match(/^inventory\/(.+)\/move$/);
 if(move){
  const item=localData.inventory.find(o=>o.id===move[1]);
  if(!item)throw Error('Insumo no encontrado');
  const delta=Number(body.delta);if(!Number.isFinite(delta)||!delta||!String(body.reason||'').trim())throw Error('Movimiento incorrecto');
  item.quantity=Math.round((Number(item.quantity)+delta)*1000)/1000;save();return item;
 }
 if(path==='staff'){
  ownerRole();if(!body.email||!body.name)throw Error('Completa nombre y correo');
  localData.staff.push({name:String(body.name),email:String(body.email)});save();
  return {ok:true,role:'staff',demo:true};
 }
 throw Error('Esta función aún no está disponible en la demo');
}
const showLogin=()=>{$('#login').hidden=false;$('#dashboard').hidden=true;$('#userTop').innerHTML='';clearInterval(timer)};
async function start(){try{const status=await api('health');if(!status.database){showLogin();$notify('La base de datos no está configurada. La versión web es todavía una demostración.',true);return}user=await api('me');await showDashboard()}catch(e){showLogin()}}
async function showDashboard(){$('#login').hidden=true;$('#dashboard').hidden=false;$('#userTop').innerHTML=`<span>${safe(user.name)} · ${user.role==='owner'?'Dueña':'Encargado'}</span><button class="micro" id="logout">Salir</button>`;$('#logout').onclick=async()=>{try{await api('logout',{method:'POST',body:'{}'})}catch{}showLogin()};$('#hello').textContent=user.role==='owner'?'Panel de Kas · Control total':'Panel de caja · Encargado';$('#roleLabel').textContent=user.role==='owner'?'ACCESO DUEÑA':'ACCESO ENCARGADO';$('#ownerTools').hidden=user.role!=='owner';$('#ownerInventory').hidden=user.role!=='owner';await fetchDashboard();timer=setInterval(fetchDashboard,8000)}
async function fetchDashboard(){if(!user)return;try{dashboard=await api('dashboard?days='+$('#period').value);render()}catch(e){if(e.message==='Inicia sesión'||e.message==='La sesión venció'){user=null;showLogin()}else $notify(e.message,true)}}
function render(){const d=dashboard,m=d.metrics||{};$('#revenue').textContent=fmt(m.revenue_cents);$('#ordersNum').textContent=m.order_count||0;$('#paidOrders').textContent=(m.paid_count||0)+' pedidos pagados';$('#average').textContent=fmt((m.paid_count||0)>0?Number(m.revenue_cents)/(m.paid_count):0);$('#cancellations').textContent=m.cancelled_count||0;
 $('#orderRows').innerHTML=d.orders.length?d.orders.map(o=>`<tr><td><b>Felicidad #${String(o.id).padStart(4,'0')}</b><br><small>${new Date(o.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</small></td><td>${safe(o.customer_name||'Mostrador')}<br><small>${safe(o.source)}</small></td><td>${safe(o.products)}</td><td><span class="money">${fmt(o.total_cents)}</span><br><small>${o.payment_state==='pagado'?'Pagado':'Por cobrar'}${o.refund_required?' · devolución pendiente':''}</small></td><td><span class="status ${safe(o.status)}">${safe(o.status)}</span></td><td><div class="row-actions">${o.status!=='cancelado'?`<select data-state="${o.id}"><option value="">Estado…</option><option>confirmado</option><option>preparando</option><option>listo</option><option>entregado</option></select>${o.payment_state!=='pagado'?`<button class="micro" data-paid="${o.id}">Cobrar</button>`:''}`:''}${user.role==='owner'&&o.status!=='cancelado'?`<button class="micro danger" data-cancel="${o.id}">Cancelar</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6">Todavía no hay órdenes registradas.</td></tr>';
 const max=Math.max(1,...d.daysChart.map(x=>Number(x.sales_cents||0)));$('#salesChart').innerHTML=d.daysChart.map(x=>`<div tabindex="0" class="bar-day" style="height:${Math.max(3,Math.round(Number(x.sales_cents||0)*100/max))}%" title="${safe(x.date)}: ${fmt(x.sales_cents)}" aria-label="${safe(x.date)} ${fmt(x.sales_cents)}"></div>`).join('');
 $('#inboxRows').innerHTML=d.inbox.length?d.inbox.map(x=>`<div class="inbox-entry"><div><b>${safe(x.customer_name||x.from_phone)}</b><small> · ${new Date(x.received_at).toLocaleString('es-MX')}</small><p>${safe(x.content)}</p></div>${x.reviewed?'<span class="pill">Revisado</span>':`<button class="micro" data-review="${safe(x.message_id)}">Revisar</button>`}</div>`).join(''):'<div class="empty">No hay mensajes sincronizados. El número y webhook oficial están pendientes.</div>';
 $('#inventoryRows').innerHTML=d.inventory.length?d.inventory.map(x=>`<div class="inventory-entry"><div><b>${safe(x.name)}</b><br><small>Existencia: ${Number(x.quantity)} ${safe(x.unit)} ${Number(x.quantity)<=Number(x.minimum)?'· mínimo alcanzado':''}</small></div><button class="micro" data-move="${safe(x.id)}">Registrar ±</button></div>`).join(''):'<div class="empty">Registra los insumos iniciales para controlar entradas y salidas.</div>';
 $('#topProducts').innerHTML=d.top.length?d.top.map(x=>`<div class="topline"><b>${safe(x.product_name)}</b><span class="pill">${x.quantity} piezas</span></div>`).join(''):'<div class="empty">Se mostrarán productos cobrados.</div>';
 renderProducts();
}
async function loadProducts(){catalog=await api('products');renderProducts()}
function renderProducts(){if(!catalog.length)return;$('#counterProducts').innerHTML=catalog.filter(p=>p.available).map(p=>`<label class="counter-entry"><span>${safe(p.name)} · ${fmt(p.price_cents)}</span><input type="number" min="0" max="30" value="0" data-cart-product="${safe(p.id)}" aria-label="Cantidad ${safe(p.name)}"></label>`).join('');if(user?.role==='owner')$('#ownerProducts').innerHTML=catalog.map(p=>`<div class="menu-edit"><span>${safe(p.name)}</span><input type="number" step=".01" value="${p.price_cents/100}" id="price-${safe(p.id)}" aria-label="Precio"><button class="micro" data-product-save="${safe(p.id)}">✓</button></div><label style="margin:0 0 12px"><input type="checkbox" data-product-stock="${safe(p.id)}" ${p.available?'checked':''}> Disponible</label>`).join('')+'<div class="empty">Kas controla precios y disponibilidad. Actualizar modifica la base central.</div>'}
function getCounter(){return [...document.querySelectorAll('[data-cart-product]')].map(x=>({id:x.dataset.cartProduct,qty:Number(x.value)})).filter(x=>x.qty>0)}
async function createCounter(){const items=getCounter();if(!items.length)return $notify('Selecciona al menos un producto',true);try{const result=await api('orders/counter',{method:'POST',body:JSON.stringify({items,customerName:$('#counterName').value,notes:$('#counterNotes').value})});$notify('Pedido creado: '+result.folio+' · '+fmt(result.total_cents));document.querySelectorAll('[data-cart-product]').forEach(x=>x.value=0);$('#counterName').value='';$('#counterNotes').value='';await fetchDashboard()}catch(e){$notify(e.message,true)}}
const actions=async e=>{const t=e.target.closest('[data-paid],[data-state],[data-cancel],[data-review],[data-move],[data-product-save],[data-product-stock]');if(!t)return;try{
 if(t.dataset.paid){const method=prompt('Método de pago: efectivo, transferencia o tarjeta','efectivo');if(!method)return;await api('orders/'+t.dataset.paid+'/pay',{method:'POST',body:JSON.stringify({method:method.toLowerCase().trim()})});}
 else if(t.dataset.state){if(!t.value)return;await api('orders/'+t.dataset.state+'/status',{method:'POST',body:JSON.stringify({status:t.value})});}
 else if(t.dataset.cancel){if(user.role!=='owner')return;const reason=prompt('Solo Kas: motivo de cancelación (obligatorio)');if(!reason)return;await api('orders/'+t.dataset.cancel+'/cancel',{method:'POST',body:JSON.stringify({reason})});}
 else if(t.dataset.review){await api('whatsapp/'+encodeURIComponent(t.dataset.review)+'/review',{method:'POST',body:'{}'});}
 else if(t.dataset.move){const delta=Number(prompt('Entrada positiva / salida negativa','-1'));if(!Number.isFinite(delta)||delta===0)return;const reason=prompt('Motivo de movimiento','Consumo / reposición');if(!reason)return;await api('inventory/'+t.dataset.move+'/move',{method:'POST',body:JSON.stringify({delta,reason})});}
 else if(t.dataset.productSave){const p=catalog.find(x=>x.id===t.dataset.productSave),price=Number($('#price-'+p.id)?.value);await api('products/'+p.id,{method:'PATCH',body:JSON.stringify({price})});await loadProducts();}
 else if(t.dataset.productStock){await api('products/'+t.dataset.productStock,{method:'PATCH',body:JSON.stringify({available:t.checked})});await loadProducts();}
 await fetchDashboard();
 }catch(err){$notify(err.message,true)}};
$('#orderRows').addEventListener('change',actions);$('#orderRows').addEventListener('click',actions);$('#inboxRows').addEventListener('click',actions);$('#inventoryRows').addEventListener('click',actions);$('#ownerProducts').addEventListener('click',actions);$('#ownerProducts').addEventListener('change',e=>{if(e.target.matches('[data-product-stock]'))actions(e)});
$('#loginForm').onsubmit=async e=>{e.preventDefault();if(loginActive)return;loginActive=true;try{user=await api('login',{method:'POST',body:JSON.stringify({role:$('#demoRole').value,password:$('#loginPassword').value})});$('#loginPassword').value='';await loadProducts();await showDashboard()}catch(err){$notify(err.message,true)}finally{loginActive=false}};
$('#createCounter').onclick=createCounter;$('#period').onchange=fetchDashboard;$('#refresh').onclick=fetchDashboard;
$('#productsToggle').onclick=()=>{$('#ownerProducts').hidden=!$('#ownerProducts').hidden};$('#staffToggle').onclick=()=>{$('#staffForm').hidden=!$('#staffForm').hidden};
$('#staffForm').onsubmit=async e=>{e.preventDefault();try{await api('staff',{method:'POST',body:JSON.stringify({name:$('#staffName').value,email:$('#staffEmail').value,password:$('#staffPass').value})});$notify('Acceso de encargado creado');$('#staffForm').reset();$('#staffForm').hidden=true}catch(err){$notify(err.message,true)}};
$('#addInventory').onclick=async()=>{try{await api('inventory',{method:'POST',body:JSON.stringify({name:$('#inventoryName').value,unit:$('#inventoryUnit').value,quantity:Number($('#inventoryQty').value)})});$notify('Insumo creado');$('#inventoryName').value='';await fetchDashboard()}catch(err){$notify(err.message,true)}};
document.querySelector('#simulateWhatsApp').onclick=async()=>{try{await api('demo/inbox',{method:'POST',body:'{}'});$notify('Mensaje de prueba recibido. No es un WhatsApp real.');await fetchDashboard()}catch(e){$notify(e.message,true)}};
document.querySelector('#refresh').insertAdjacentHTML('afterend','<button type="button" class="outline" id="resetDemo">Reiniciar demo</button>');
document.querySelector('#resetDemo').onclick=()=>{
 if(!confirm('¿Eliminar todos los pedidos y ajustes de ESTA demostración?'))return;
 localData=initial();save();loadProducts().then(fetchDashboard);$notify('Demostración reiniciada');
};
const param=new URLSearchParams(location.search).get('rol');
if(param==='kas'||param==='owner')document.querySelector('#demoRole').value='owner';
if(param==='empleado'||param==='staff')document.querySelector('#demoRole').value='staff';
start().then(async()=>{if(user)await loadProducts()});
})();
