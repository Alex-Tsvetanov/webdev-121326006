create table users (
  id serial primary key,
  email text not null unique,
  name text,
  password_hash text,
  created_at timestamptz not null default now()
);

create table identities (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  unique (provider, provider_user_id)
);

create table sessions (
  token_hash text primary key,
  user_id int not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table labs (
  id serial primary key,
  name text not null,
  location text not null,
  capacity int not null check (capacity > 0)
);

create table equipment (
  id serial primary key,
  name text not null unique
);

-- Many-to-many: a lab has many pieces of equipment, and equipment sits in many labs.
create table lab_equipment (
  lab_id int not null references labs(id) on delete cascade,
  equipment_id int not null references equipment(id) on delete cascade,
  primary key (lab_id, equipment_id)
);

create table reservations (
  id serial primary key,
  lab_id int not null references labs(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
