import express from 'express';
import helmet from 'helmet';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

const app=express();const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hasDB=!!process.env.DATABASE_URL;
const pool=hasDB?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='off'?false:{rejectUnauthorized:false},max:12}):null;
const money=n=>Math.round(Number(n)*100);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const jsonError=(res,status,message)=>res.status(status).json({error:message});
const secureCookie=process.env.NODE_ENV==='production';
const detectPhone=v=>String(v||'').replace(/[^0-9]/g,'').slice(0,16);
const mask=v=>String(v||'').slice(0,240);
const ipAttempts=new Map();
app.disable('x-powered-by');app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false}));
// Meta exige verificar HMAC con el cuerpo ORIGINAL, antes de analizar JSON.
app.post('/webhooks/whatsapp',express.raw({type:'application/json',limit:'512kb'}),async(req,res)=>{
 const secret=process.env.META_APP_SECRET;
 if(!hasDB||!secret)return jsonError(res,503,'Webhook no configurado');
 const sig=req.get('x-hub-signature-256')||'';
 const expected='sha256='+crypto.createHmac('sha256',secret).update(req.body).digest('hex');
 if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return res.sendStatus(403);
 try{
  const payload=JSON.parse(req.body.toString('utf8'));const rows=[];
  for(const entry of payload.entry||[])for(const change of entry.changes||[])for(const m of change.value?.messages||[]){
   rows.push([String(m.id||''),detectPhone(m.from),mask(change.value?.contacts?.find(x=>x.wa_id===m.from)?.profile?.name||''),mask(m.text?.body||m.button?.text||m.interactive?.button_reply?.title||'[Mensaje multimedia]')]);
  }
  for(const [id,phone,name,body] of rows){if(!id)continue;await pool.query('insert into whatsapp_inbox(message_id,from_phone,customer_name,content) values($1,$2,$3,$4) on conflict(message_id) do nothing',[id,phone,name,body])}
  res.sendStatus(200);
 }catch(e){console.error('WhatsApp webhook:',e);res.sendStatus(500)}
});
app.get('/webhooks/whatsapp',(req,res)=>{
 const {['hub.mode']:mode,['hub.verify_token']:given,['hub.challenge']:challenge}=req.query;
 if(process.env.META_VERIFY_TOKEN&&mode==='subscribe'&&given===process.env.META_VERIFY_TOKEN)return res.type('text/plain').send(String(challenge||''));
 return res.sendStatus(403);
});
app.use(express.json({limit:'80kb'}));
// Archivos internos no se exponen como contenido estático público.
app.use(['/src','/db','/scripts'],(req,res)=>res.sendStatus(404));
app.use(express.static(root,{extensions:['html'],index:'index.html',maxAge:'1h',setHeaders:(res,filePath)=>{if(/\.(?:html|js|css)$/i.test(filePath))res.setHeader('Cache-Control','no-cache');}}));
app.get('/api/health',async(req,res)=>{if(!hasDB)return res.json({server:true,database:false,live:false});try{await pool.query('select 1');return res.json({server:true,database:true,live:true})}catch{return jsonError(res,503,'Base de datos sin conexión')}});
app.get('/api/config',(req,res)=>res.json({whatsapp:detectPhone(process.env.WHATSAPP_NUMBER),onlineOrders:process.env.ALLOW_PUBLIC_ORDERS==='true'&&hasDB}));
const dbRequired=(req,res,next)=>hasDB?next():jsonError(res,503,'Base de datos pendiente de configurar');
app.use('/api',dbRequired);
const getToken=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ef_session='))?.slice(11)||'';
async function auth(req,res,next){
 const token=getToken(req);if(!token)return jsonError(res,401,'Inicia sesión');
 try{const q=await pool.query(`select u.id,u.name,u.email,u.role from login_sessions s join staff_users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.active=true`,[hash(token)]);if(!q.rowCount)return jsonError(res,401,'La sesión venció');req.user=q.rows[0];next()}catch(e){next(e)}
}
const owner=(req,res,next)=>req.user?.role==='owner'?next():jsonError(res,403,'Acceso reservado a la dueña');
const audit=async(client,user,action,entity,id,details={})=>client.query('insert into audit_events(actor_id,action,entity,entity_id,details) values($1,$2,$3,$4,$5)',[user||null,action,entity,String(id),JSON.stringify(details)]);
app.post('/api/login',async(req,res,next)=>{
 const key=String(req.body.email||'').trim().toLowerCase();const password=String(req.body.password||'');
 const ip=req.ip;const hits=ipAttempts.get(ip)||{start:Date.now(),count:0};if(Date.now()-hits.start>900000){hits.start=Date.now();hits.count=0}if(hits.count>=10)return jsonError(res,429,'Demasiados intentos; intenta después');
 try{const q=await pool.query('select * from staff_users where email=$1 and active=true',[key]);if(!q.rowCount||!await bcrypt.compare(password,q.rows[0].password_hash)){hits.count++;ipAttempts.set(ip,hits);return jsonError(res,401,'Datos incorrectos')}ipAttempts.delete(ip);
 const raw=crypto.randomBytes(32).toString('hex');await pool.query(`insert into login_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '12 hours')`,[hash(raw),q.rows[0].id]);
 res.cookie('ef_session',raw,{httpOnly:true,secure:secureCookie,sameSite:'lax',path:'/',maxAge:12*3600000});res.json({ok:true,role:q.rows[0].role,name:q.rows[0].name});}catch(e){next(e)}
});
app.post('/api/logout',auth,async(req,res)=>{await pool.query('delete from login_sessions where token_hash=$1',[hash(getToken(req))]);res.clearCookie('ef_session',{path:'/'}).json({ok:true})});
app.get('/api/me',auth,(req,res)=>res.json(req.user));
app.get('/api/products',async(req,res,next)=>{try{const q=await pool.query('select id,name,category,description,price_cents,extra_topoki_cents,photo_path,available from catalog_products order by name');res.json(q.rows)}catch(e){next(e)}});
app.patch('/api/products/:id',auth,owner,async(req,res,next)=>{
 const {name,description,price,available}=req.body;const updates=[],values=[];
 if(name!==undefined){if(!String(name).trim()||String(name).length>100)return jsonError(res,400,'Nombre inválido');values.push(String(name));updates.push(`name=$${values.length}`)}
 if(description!==undefined){values.push(String(description).slice(0,300));updates.push(`description=$${values.length}`)}
 if(price!==undefined){if(!Number.isFinite(Number(price))||+price<0||+price>10000)return jsonError(res,400,'Precio inválido');values.push(money(price));updates.push(`price_cents=$${values.length}`)}
 if(typeof available==='boolean'){values.push(available);updates.push(`available=$${values.length}`)}
 if(!updates.length)return jsonError(res,400,'Sin cambios');
 try{values.push(req.params.id);const q=await pool.query(`update catalog_products set ${updates.join(',')},updated_at=now() where id=$${values.length} returning *`,values);if(!q.rowCount)return jsonError(res,404,'No existe');await audit(pool,req.user.id,'producto_modificado','product',req.params.id,req.body);res.json(q.rows[0])}catch(e){next(e)}
});
app.post('/api/products',auth,owner,async(req,res,next)=>{
 const {id,name,category,price}=req.body;if(!/^[a-z0-9_-]{3,40}$/.test(String(id||''))||!String(name||'').trim()||!['elotes','esquites','especialidades'].includes(category)||!Number.isFinite(+price)||+price<0)return jsonError(res,400,'Datos inválidos');
 try{const q=await pool.query('insert into catalog_products(id,name,category,price_cents) values($1,$2,$3,$4) returning *',[id,String(name).slice(0,100),category,money(price)]);await audit(pool,req.user.id,'producto_creado','product',id,{});res.status(201).json(q.rows[0])}catch(e){if(e.code==='23505')return jsonError(res,409,'Ya existe ese ID');next(e)}
});
// Clientes QR sólo al habilitar el modo público. Caja usa sesión autentificada.
const createOrder=async(req,res,next,source,actor)=>{
 const {items,customerName='',customerPhone='',notes=''}=req.body;
 if(!Array.isArray(items)||!items.length||items.length>25||!items.every(i=>typeof i.id==='string'&&Number.isInteger(+i.qty)&&+i.qty>0&&+i.qty<=30))return jsonError(res,400,'Productos inválidos');
 const client=await pool.connect();try{
 await client.query('begin');const ids=items.map(i=>i.id);const productRows=await client.query('select * from catalog_products where id=any($1::text[]) and available=true',[ids]);const products=new Map(productRows.rows.map(x=>[x.id,x]));let total=0;
 const lines=items.map(i=>{const p=products.get(i.id);if(!p)throw new Error('Producto no disponible: '+i.id);const options={sauces:Array.isArray(i.sauces)?i.sauces.slice(0,6).map(mask):[],spice:mask(i.spice),removals:Array.isArray(i.removals)?i.removals.slice(0,6).map(mask):[],note:mask(i.note),topoki:!!i.topoki};const extra=options.topoki?p.extra_topoki_cents:0;total+=(p.price_cents+extra)*+i.qty;return {p,options,extra,qty:+i.qty}});
 if(total>2500000)throw new Error('Total supera el límite');
 const order=await client.query('insert into sales_orders(source,customer_name,customer_phone,total_cents,notes,created_by) values($1,$2,$3,$4,$5,$6) returning id,status,total_cents,created_at',[source,mask(customerName),detectPhone(customerPhone),total,mask(notes),actor||null]);
 for(const l of lines)await client.query('insert into sales_order_items(order_id,product_id,product_name,quantity,unit_cents,addons_cents,options) values($1,$2,$3,$4,$5,$6,$7)',[order.rows[0].id,l.p.id,l.p.name,l.qty,l.p.price_cents,l.extra,JSON.stringify(l.options)]);
 await audit(client,actor,'pedido_creado','order',order.rows[0].id,{source});await client.query('commit');
 res.status(201).json({...order.rows[0],folio:'Felicidad #'+String(order.rows[0].id).padStart(4,'0'),total:total/100});
 }catch(e){await client.query('rollback');return jsonError(res,400,e.message)}finally{client.release()}
};
app.post('/api/orders/qr',async(req,res,next)=>{
 if(process.env.ALLOW_PUBLIC_ORDERS!=='true')return jsonError(res,403,'Pedidos QR en espera de activación');
 const ip=req.ip+'qr';const r=ipAttempts.get(ip)||{start:Date.now(),count:0};if(Date.now()-r.start>3600000){r.start=Date.now();r.count=0}r.count++;ipAttempts.set(ip,r);if(r.count>8)return jsonError(res,429,'Límite de pedidos de prueba');
 return createOrder(req,res,next,'qr',null)
});
app.post('/api/orders/counter',auth,(req,res,next)=>createOrder(req,res,next,'mostrador',req.user.id));
app.get('/api/dashboard',auth,async(req,res,next)=>{
 const days=Math.max(1,Math.min(30,parseInt(req.query.days||'1',10)||1));
 try{
  const metrics=await pool.query(`select count(*) filter(where payment_state='pagado' and status!='cancelado')::int paid_count,coalesce(sum(total_cents) filter(where payment_state='pagado' and status!='cancelado'),0)::bigint revenue_cents,count(*) filter(where status!='cancelado')::int order_count,count(*) filter(where status='cancelado')::int cancelled_count from sales_orders where created_at>=now()-($1::int*interval '1 day')`,[days]);
  const orders=await pool.query(`select o.id,o.created_at,o.source,o.customer_name,o.status,o.payment_state,o.payment_method,o.total_cents,o.refund_required,coalesce((select string_agg(i.quantity || '× ' || i.product_name,', ') from sales_order_items i where i.order_id=o.id),'') products from sales_orders o where o.created_at>=now()-interval '30 days' order by o.created_at desc limit 150`);
  const byDay=await pool.query(`select to_char(d,'YYYY-MM-DD') date,coalesce(sum(total_cents) filter(where payment_state='pagado' and status!='cancelado'),0)::bigint sales_cents from generate_series(current_date-29,current_date,interval '1 day') d left join sales_orders o on o.paid_at::date=d::date group by d order by d`);
  const top=await pool.query(`select product_name,sum(quantity)::int quantity from sales_order_items i join sales_orders o on o.id=i.order_id where o.payment_state='pagado' and o.status!='cancelado' and o.created_at>=now()-interval '30 days' group by product_name order by quantity desc limit 6`);
  const inbox=await pool.query('select message_id,from_phone,customer_name,content,received_at,reviewed from whatsapp_inbox order by received_at desc limit 30');
  const inventory=await pool.query('select * from inventory_items order by name');
  res.json({role:req.user.role,name:req.user.name,days,metrics:metrics.rows[0],orders:orders.rows,daysChart:byDay.rows,top:top.rows,inbox:inbox.rows,inventory:inventory.rows});
 }catch(e){next(e)}
});
app.post('/api/orders/:id/status',auth,async(req,res,next)=>{
 const state=String(req.body.status||'');if(!['confirmado','preparando','listo','entregado'].includes(state))return jsonError(res,400,'Estado inválido');
 try{const q=await pool.query(`update sales_orders set status=$1,updated_at=now() where id=$2 and status!='cancelado' returning id,status`,[state,req.params.id]);if(!q.rowCount)return jsonError(res,409,'Pedido inexistente o cancelado');await audit(pool,req.user.id,'estado_cambiado','order',req.params.id,{state});res.json(q.rows[0])}catch(e){next(e)}
});
app.post('/api/orders/:id/pay',auth,async(req,res,next)=>{
 const method=String(req.body.method||'');if(!['efectivo','transferencia','tarjeta'].includes(method))return jsonError(res,400,'Forma de pago no válida');
 try{const q=await pool.query(`update sales_orders set payment_state='pagado',payment_method=$1,paid_at=now(),updated_at=now() where id=$2 and payment_state='pendiente' and status!='cancelado' returning id,payment_state`,[method,req.params.id]);if(!q.rowCount)return jsonError(res,409,'No disponible para cobro');await audit(pool,req.user.id,'pago_registrado','order',req.params.id,{method});res.json(q.rows[0])}catch(e){next(e)}
});
app.post('/api/orders/:id/cancel',auth,owner,async(req,res,next)=>{
 const reason=String(req.body.reason||'').trim();if(reason.length<5||reason.length>250)return jsonError(res,400,'Escribe motivo de cancelación (5-250 caracteres)');
 try{const q=await pool.query(`update sales_orders set status='cancelado',cancelled_at=now(),cancelled_by=$1,cancel_reason=$2,refund_required=(payment_state='pagado'),updated_at=now() where id=$3 and status!='cancelado' returning id,status,refund_required`,[req.user.id,reason,req.params.id]);if(!q.rowCount)return jsonError(res,409,'Pedido inexistente o ya cancelado');await audit(pool,req.user.id,'pedido_cancelado','order',req.params.id,{reason,refund_required:q.rows[0].refund_required});res.json(q.rows[0])}catch(e){next(e)}
});
app.post('/api/whatsapp/:id/review',auth,async(req,res,next)=>{try{const q=await pool.query('update whatsapp_inbox set reviewed=true,reviewed_by=$1 where message_id=$2 returning message_id,reviewed',[req.user.id,req.params.id]);res.json(q.rows[0]||null)}catch(e){next(e)}});
app.post('/api/inventory',auth,owner,async(req,res,next)=>{const {name,unit='pieza',quantity=0,minimum=0}=req.body;if(!String(name).trim()||String(name).length>90||!Number.isFinite(+quantity)||!Number.isFinite(+minimum))return jsonError(res,400,'Inventario inválido');try{const q=await pool.query('insert into inventory_items(name,unit,quantity,minimum) values($1,$2,$3,$4) returning *',[String(name).trim(),String(unit).slice(0,20),+quantity,+minimum]);await audit(pool,req.user.id,'inventario_creado','inventory',q.rows[0].id,{name});res.status(201).json(q.rows[0])}catch(e){next(e)}});
app.post('/api/inventory/:id/move',auth,async(req,res,next)=>{const delta=Number(req.body.delta),reason=String(req.body.reason||'').trim();if(!Number.isFinite(delta)||!delta||Math.abs(delta)>100000||reason.length<3)return jsonError(res,400,'Movimiento inválido');const c=await pool.connect();try{await c.query('begin');const q=await c.query('update inventory_items set quantity=quantity+$1,updated_at=now() where id=$2 returning id,name,quantity',[delta,req.params.id]);if(!q.rowCount)throw new Error('No existe el insumo');await c.query('insert into inventory_movements(item_id,quantity_delta,reason,done_by) values($1,$2,$3,$4)',[req.params.id,delta,reason.slice(0,200),req.user.id]);await audit(c,req.user.id,'ajuste_inventario','inventory',req.params.id,{delta,reason});await c.query('commit');res.json(q.rows[0])}catch(e){await c.query('rollback');jsonError(res,400,e.message)}finally{c.release()}});
app.post('/api/staff',auth,owner,async(req,res,next)=>{const {email,name,password}=req.body;if(!String(email).includes('@')||!String(name).trim()||String(password||'').length<14)return jsonError(res,400,'Correo, nombre y contraseña de al menos 14 caracteres');try{const pass=await bcrypt.hash(password,12);const q=await pool.query(`insert into staff_users(email,name,password_hash,role) values($1,$2,$3,'staff') returning id,email,name,role`,[String(email).toLowerCase().trim(),String(name).slice(0,80),pass]);res.status(201).json(q.rows[0])}catch(e){next(e)}});
app.use((err,req,res,next)=>{console.error('API',err);jsonError(res,500,'Error del servidor; revisa los registros')});
async function boot(){
 if(pool){
  // En la primera conexión se crean las tablas y productos con SQL idempotente.
  // La base de datos debe ser EXCLUSIVA de Elote Feliz.
  const schema=await readFile(path.join(root,'db/schema.sql'),'utf8');
  await pool.query(schema);
  const email=String(process.env.OWNER_EMAIL||'').trim().toLowerCase();
  const password=String(process.env.OWNER_PASSWORD||'');
  if(email&&password){
   if(!/^\\S+@\\S+\\.\\S+$/.test(email)||password.length<14)throw Error('OWNER_EMAIL/OWNER_PASSWORD no válidos');
   const q=await pool.query("select count(*)::int AS n from staff_users where role='owner'");
   if(q.rows[0].n===0){
    await pool.query("insert into staff_users(email,name,password_hash,role) values($1,$2,$3,'owner') on conflict(email) do nothing",
      [email,String(process.env.OWNER_NAME||'Kas').slice(0,80),await bcrypt.hash(password,12)]);
    console.log('Cuenta de dueña inicializada; retira OWNER_PASSWORD de Render.');
   }
  }
 }
 app.listen(process.env.PORT||10000,'0.0.0.0',()=>console.log('Elote Feliz servidor listo · bd:',hasDB?'configurada':'pendiente'));
}
boot().catch(e=>{console.error('No se pudo inicializar Elote Feliz:',e.message);process.exit(1)});
