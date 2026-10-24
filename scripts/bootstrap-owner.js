import pg from 'pg';
import bcrypt from 'bcryptjs';
const {DATABASE_URL,OWNER_EMAIL,OWNER_PASSWORD,OWNER_NAME='Kas'}=process.env;
if(!DATABASE_URL||!OWNER_EMAIL||!OWNER_PASSWORD||OWNER_PASSWORD.length<14){console.error('Configura DATABASE_URL, OWNER_EMAIL y OWNER_PASSWORD de al menos 14 caracteres.');process.exit(1)}
const db=new pg.Pool({connectionString:DATABASE_URL,ssl:process.env.PGSSL==='off'?false:{rejectUnauthorized:false}});
try{
 const hash=await bcrypt.hash(OWNER_PASSWORD,12);
 const r=await db.query(`insert into staff_users(email,name,password_hash,role) values($1,$2,$3,'owner') on conflict(email) do update set name=excluded.name,password_hash=excluded.password_hash,role='owner',active=true returning email,role`,[OWNER_EMAIL.trim().toLowerCase(),OWNER_NAME,hash]);
 console.log('Cuenta dueña configurada:',r.rows[0].email);
}finally{await db.end()}
