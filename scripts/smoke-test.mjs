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
  localStorage:{getItem(){return null},setItem(){}},
  location:{hash:'',href:''},navigator:{},console,
  setTimeout(){return 0},clearTimeout(){},
 };
 vm.runInNewContext(script,ctx,{filename:'app.js',timeout:3000});
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
 }
 if(page==='ubicacion') assert.match(mockNode('#infoPage').innerHTML,/google\.com\/maps/);
}
for(const page of ['inicio','menu','ubicacion'])checkPage(page);
console.log('Smoke OK: menú, seis salsas, logo, mascotas y mapa');
