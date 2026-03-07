-- YouGotWanged — Supabase schema
-- Run this in the Supabase SQL editor to set up your database

create table if not exists trades (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  team_a_name text not null,
  team_a_players text not null,
  team_b_name text not null,
  team_b_players text not null,
  description text,
  created_at timestamp with time zone default now() not null
);

-- Enable Row Level Security
alter table trades enable row level security;

-- Allow anyone to read trades
create policy "Trades are viewable by everyone"
  on trades for select
  using (true);

-- Allow anyone to insert trades (lock this down later with auth)
create policy "Anyone can submit a trade"
  on trades for insert
  with check (true);

-- Index for sorting by date
create index if not exists trades_created_at_idx on trades (created_at desc);
