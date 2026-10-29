-- ==============================================================================
-- Zaboraa FX Supabase Auth & RBAC Migration
-- 20261029000000_auth_rbac.sql
-- ==============================================================================

-- 1. Profiles Table (Holds identity, role, status)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Direct browser inserts/updates/deletes are strictly forbidden
-- Only Supabase Service Role Key (Server-side) may insert/update/delete profiles
CREATE POLICY "Service role full access on profiles"
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Custom Roles Table
CREATE TABLE IF NOT EXISTS public.custom_roles (
  role_name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read custom roles"
  ON public.custom_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages custom roles"
  ON public.custom_roles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. Role Permissions Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_name TEXT NOT NULL REFERENCES public.custom_roles(role_name) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (role_name, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read role permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages role permissions"
  ON public.role_permissions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Seed Built-In Roles
INSERT INTO public.custom_roles (role_name, description, is_system) VALUES
  ('master_admin', 'Supreme administrator with unrestricted platform authority', true),
  ('admin', 'Operational administrator with account and firewall management authority', true),
  ('trader', 'Trading desk operator authorized for manual execution and backtesting', true),
  ('viewer', 'Read-only observer authorized for market research and reporting', true),
  ('pending', 'Newly registered account awaiting administrator approval', true)
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description;

-- Seed Built-In Role Permissions
-- master_admin has all permissions
INSERT INTO public.role_permissions (role_name, permission) VALUES
  ('master_admin', 'research.view'),
  ('master_admin', 'backtest.run'),
  ('master_admin', 'strategy.edit'),
  ('master_admin', 'bot.start_stop'),
  ('master_admin', 'order.place_demo'),
  ('master_admin', 'order.place_live'),
  ('master_admin', 'account.view'),
  ('master_admin', 'account.manage'),
  ('master_admin', 'firewall.view'),
  ('master_admin', 'firewall.edit'),
  ('master_admin', 'user.manage'),
  ('master_admin', 'audit.view'),
  ('master_admin', 'settings.edit'),
  ('master_admin', 'kill.engage'),

  ('admin', 'research.view'),
  ('admin', 'backtest.run'),
  ('admin', 'strategy.edit'),
  ('admin', 'bot.start_stop'),
  ('admin', 'order.place_demo'),
  ('admin', 'order.place_live'),
  ('admin', 'account.view'),
  ('admin', 'account.manage'),
  ('admin', 'firewall.view'),
  ('admin', 'firewall.edit'),
  ('admin', 'user.manage'),
  ('admin', 'audit.view'),
  ('admin', 'kill.engage'),

  ('trader', 'research.view'),
  ('trader', 'backtest.run'),
  ('trader', 'strategy.edit'),
  ('trader', 'bot.start_stop'),
  ('trader', 'order.place_demo'),
  ('trader', 'account.view'),
  ('trader', 'firewall.view'),

  ('viewer', 'research.view'),
  ('viewer', 'account.view'),
  ('viewer', 'audit.view')
ON CONFLICT DO NOTHING;

-- 5. Automatic Profile Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, role, status)
  VALUES (new.id, new.email, 'pending', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
