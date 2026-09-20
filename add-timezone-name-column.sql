alter table public.push_subscriptions add column if not exists timezone_name text default 'Europe/Stockholm';
