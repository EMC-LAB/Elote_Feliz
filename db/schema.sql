-- Elote Feliz: esquema transaccional para operación real; ejecutar en PostgreSQL 15+.
-- Todo cambio relevante conserva historial. Folios globales generados dentro de la BD.
create extension if not exists pgcrypto;
create table if not exists staff_users (
 id uuid primary key default gen_random_uuid(), email text unique not null,
 name text not null, password_hash text not null,
 role text not null check(role in ('owner','staff')),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists login_sessions (
 token_hash text primary key, user_id uuid not null references staff_users(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists login_sessions_expire on login_sessions(expires_at);
create table if not exists catalog_products (
 id text primary key, name text not null, category text not null,
 description text not null default '', price_cents integer not null check(price_cents>=0),
 extra_topoki_cents integer not null default 0 check(extra_topoki_cents>=0),
 photo_path text, available boolean not null default true,
 updated_at timestamptz not null default now()
);
create table if not exists sales_orders (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 source text not null check(source in ('mostrador','qr','whatsapp','telefono')),
 customer_name text not null default '', customer_phone text not null default '',
 status text not null default 'nuevo' check(status in ('nuevo','confirmado','preparando','listo','entregado','cancelado')),
 payment_state text not null default 'pendiente' check(payment_state in ('pendiente','pagado')),
 payment_method text, paid_at timestamptz, total_cents integer not null check(total_cents>=0),
 notes text not null default '',
 created_by uuid references staff_users(id), cancelled_at timestamptz,
 cancelled_by uuid references staff_users(id), cancel_reason text,
 refund_required boolean not null default false
);
create index if not exists sales_orders_created on sales_orders(created_at desc);
create index if not exists sales_orders_paid on sales_orders(paid_at) where payment_state='pagado';
create table if not exists sales_order_items (
 id bigint generated always as identity primary key,
 order_id bigint not null references sales_orders(id) on delete cascade,
 product_id text references catalog_products(id),
 product_name text not null, quantity integer not null check(quantity between 1 and 30),
 unit_cents integer not null check(unit_cents>=0),
 addons_cents integer not null default 0 check(addons_cents>=0),
 options jsonb not null default '{}'::jsonb
);
create table if not exists inventory_items (
 id uuid primary key default gen_random_uuid(), name text unique not null,
 unit text not null default 'pieza', quantity numeric(14,3) not null default 0,
 minimum numeric(14,3) not null default 0, updated_at timestamptz not null default now()
);
create table if not exists inventory_movements (
 id bigint generated always as identity primary key, item_id uuid not null references inventory_items(id),
 quantity_delta numeric(14,3) not null, reason text not null, done_by uuid references staff_users(id),
 created_at timestamptz not null default now()
);
create table if not exists whatsapp_inbox (
 message_id text primary key, from_phone text not null,
 customer_name text not null default '', content text not null default '',
 received_at timestamptz not null default now(), reviewed boolean not null default false,
 reviewed_by uuid references staff_users(id)
);
create table if not exists audit_events (
 id bigint generated always as identity primary key, actor_id uuid references staff_users(id),
 action text not null, entity text not null, entity_id text not null,
 details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
insert into catalog_products (id,name,category,description,price_cents,extra_topoki_cents,photo_path) values
('elote','Elote','elotes','El clásico que siempre hace feliz.',4000,0,'elote.webp'),
('preferido','El Preferido','elotes','Con salsa macha y queso cotija.',4000,0,'preferido.webp'),
('esquite','Esquite','esquites','En vaso, con todo el sabor.',4000,0,'esquite.webp'),
('tostiesquite','Tostiesquite','esquites','Con esquite, salsas y toppings.',6000,0,'tostiesquite.webp'),
('buldak','Buldak con esquite','especialidades','Extra de topoki +$30.',12000,3000,'buldak.webp'),
('revolcado','Elote revolcado','especialidades','2 elotes enteros cortados en rodajas.',8000,0,'revolcado.webp'),
('taquis','Con orden extra de Taquis','especialidades','Presentación por confirmar.',10000,0,'taquis.webp')
on conflict(id) do nothing;
