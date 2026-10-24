import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../operacion/demo/index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../operacion/demo/demo.js',import.meta.url),'utf8');
assert.match(html,/id="demoRole"/);
assert.match(html,/demo-banner/);
assert.match(html,/demo\.js/);
assert.ok(!script.includes("fetch('/api/"),'La demo no debe usar el backend de producción');
const helper=[
'globalThis.__testOps={',
"async login(role,password){user=await api('login',{body:JSON.stringify({role,password})});return user},",
"async create(items){return api('orders/counter',{body:JSON.stringify({items,customerName:'Prueba'})})},",
"async pay(id){return api('orders/'+id+'/pay',{body:JSON.stringify({method:'efectivo'})})},",
"async cancel(id){return api('orders/'+id+'/cancel',{body:JSON.stringify({reason:'Prueba de cancelación'})})},",
"async price(){return api('products/elote',{body:JSON.stringify({price:45})})},",
"async dashboard(){return api('dashboard?days=1')},",
"async whatsapp(){return api('demo/inbox',{body:'{}'})}",
'};'
].join('\n');
const source=script.replace(/\}\)\(\);\s*$/,helper+'})();');
assert.notEqual(source,script,'Se requiere inyectar el adaptador de prueba');
const nodes=new Map();
function node(id){
 if(!nodes.has(id))nodes.set(id,{
  id,dataset:{},value:'',innerHTML:'',textContent:'',hidden:false,style:{},
  classList:{add(){},remove(){},toggle(){},contains(){return false}},
  addEventListener(){},insertAdjacentHTML(){},setAttribute(){},reset(){},
  onclick:null,onchange:null
 });
 return nodes.get(id);
}
const store=new Map();
const storage=(prefix)=>({getItem:k=>store.get(prefix+k)||null,setItem:(k,v)=>store.set(prefix+k,v),removeItem:k=>store.delete(prefix+k)});
const doc={body:node('body'),querySelector:node,querySelectorAll:()=>[],addEventListener(){}};
const ctx={document:doc,window:{addEventListener(){}},location:{search:'?rol=empleado'},localStorage:storage('l'),sessionStorage:storage('s'),URLSearchParams,console,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},confirm:()=>true};
vm.runInNewContext(source,ctx,{filename:'demo.js',timeout:3000});
const t=ctx.__testOps;
await assert.rejects(t.login('staff','incorrecto'),/Contraseña incorrecta/);
let u=await t.login('staff','elote123');
assert.equal(u.role,'staff');
const row=await t.create([{id:'elote',qty:3},{id:'esquite',qty:2}]);
assert.equal(row.total_cents,20000,'3 elotes + 2 esquites = $200');
assert.match(row.folio,/DEMO/);
await t.pay(row.id);
let dash=await t.dashboard();
assert.equal(dash.metrics.revenue_cents,20000);
await assert.rejects(t.cancel(row.id),/reservada a Kas/);
await assert.rejects(t.price(),/reservada a Kas/);
const message=await t.whatsapp();
assert.match(message.content,/2 elotes/);
u=await t.login('owner','elote123');
assert.equal(u.role,'owner');
await t.cancel(row.id);
dash=await t.dashboard();
assert.equal(dash.metrics.revenue_cents,0,'Las cancelaciones no son ingresos');
assert.equal(dash.metrics.cancelled_count,1);
await t.price();
console.log('Demo OK: Kas/empleado, contraseña, ventas, $200, roles y cancelaciones');
