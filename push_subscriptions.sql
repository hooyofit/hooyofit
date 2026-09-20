create table public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  reminder_time text default '17:00',
  reminder_on boolean default false,
  timezone_offset_minutes integer default 0,
  last_sent_date text,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.push_subscriptions for select using (auth.uid() = user_id);

create policy "Users can insert their own subscription"
  on public.push_subscriptions for insert with check (auth.uid() = user_id);

create policy "Users can update their own subscription"
  on public.push_subscriptions for update using (auth.uid() = user_id);

create policy "Users can delete their own subscription"
  on public.push_subscriptions for delete using (auth.uid() = user_id);
