import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const script=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
function checkPage(page){
 const nodes=new Map();
 const mockNode=(name)=>{
  if(!nodes.has(name)) nodes.set(name,{
   innerHTML:'',textContent:'',src:'',href:'',hidden:false,value:'',checked:false,
   style:{},dataset:{},id:name,onclick:null,onchange:null,
   classList:{add(){},remove(){},toggle(){},contains(){return false}},
   addEventListener(){},setAttribute(){},matches(){return false}
  });
  return nodes.get(name);
 };
 const salsa=Array.from({length:6},(_,i)=>mockNode('salsa'+i));
 const spice=Array.from({length:5},(_,i)=>Object.assign(mockNode('picor'+i),{dataset:{picor:String(i)}}));
 const body=mockNode('body');
 body.dataset={page,root:'',single:'false'};
 const doc={
  body,
  querySelector:s=>mockNode(s),
  querySelectorAll:s=>s==='.salsa-card'?salsa:s==='[data-picor]'?spice:[],
  addEventListener:(evt,cb)=>{if(evt==='DOMContentLoaded')cb()}
 };
 const ctx={
  document:doc,window:{ELOTE_WHATSAPP:'525539100036',addEventListener(){}},
  localStorage:{getItem(key){return key==='ef_catalog_demo_v3'?JSON.stringify([{id:'elote',name:'Elote',price:1,cat:'elotes',img:'elote'}]):null},setItem(){}},
  location:{hash:'',href:''},navigator:{},console,
  setTimeout(){return 0},clearTimeout(){},
 };
 const marker='})();';
 const cut=script.lastIndexOf(marker);
 assert.ok(cut>=0,'La aplicación conserva su inicializador');
 const forTest=script.slice(0,cut)+String.raw
 assert.match(mockNode('#brandLogo').src,/logo-elote-feliz\.webp$/);
 assert.match(mockNode('#heroDog').src,/mascota-feliz\.webp$/);
 assert.match(spice[4].src,/picor-4\.webp$/);
 assert.match(salsa[0].innerHTML,/Arándano con ajo/);
 assert.match(salsa[2].innerHTML,/Atómica/);
 assert.match(salsa[5].innerHTML,/Cacahuate con chile/);
 if(page==='inicio'){
   assert.match(mockNode('#products').innerHTML,/Elote revolcado/);
   assert.match(mockNode('#products').innerHTML,/Tostitos/);
   assert.doesNotMatch(mockNode('#products').innerHTML,/El Preferido/);

   // Esta es la primera prueba real del cliente: 2 esquites + 3 elotes = $200.
   assert.equal(ctx.__efTests.getCatalog().find(p=>p.id==='elote').price,40,'El menú debe ignorar los precios de demos anteriores');
   const test=ctx.__efTests.setOrder([
     {id:'esquite',qty:2,sauces:['Macha','Atómica','Arándano con ajo'],spice:'Sin picante',removals:[],note:'¿Se puede extra queso amarillo?'},
     {id:'elote',qty:3,sauces:['Arándano con ajo'],spice:'Medio',removals:['Sin queso'],note:''}
   ]);
   assert.equal(test.total,200);
   assert.match(test.message,/2 × Esquite/);
   assert.match(test.message,/\$40 c\/u × 2 = \*\$80\*/);
   assert.match(test.message,/\$40 c\/u × 3 = \*\$120\*/);
   assert.match(test.message,/TOTAL ESTIMADO: \$200/);
   assert.match(test.message,/NO incluido en este total/);
   assert.doesNotMatch(test.message,/Sin salsa ·/);
   assert.deepEqual(Array.from(ctx.__efTests.getToppings()),['Sin mayonesa','Sin queso']);
   // Un revolcado $80 con el extra de Takis $20 debe valer $100 por unidad.
   const extra=ctx.__efTests.setOrder([{id:'revolcado',qty:2,topoki:true,sauces:[],spice:'Sin picante',removals:[],note:''}]);
   assert.equal(extra.total,200);
   assert.match(extra.message,/\$100 c\/u × 2 = \*\$200\*/);
   assert.match(extra.message,/Extras con precio publicado: \$40/);
   assert.match(extra.message,/Productos: \$160/);
 }
 if(page==='ubicacion') assert.match(mockNode('#infoPage').innerHTML,/google\.com\/maps/);
}
for(const page of ['inicio','menu','ubicacion'])checkPage(page);
console.log('Smoke OK: menú, seis salsas, logo, mascotas y mapa');
