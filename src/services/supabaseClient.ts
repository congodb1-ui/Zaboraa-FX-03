import { createClient, SupabaseClient } from '@supabase/supabase-js';

let clientInstance: SupabaseClient | null = null;
let clientConfig: { configured: boolean; supabaseUrl?: string; supabaseAnonKey?: string } | null = null;
let configPromise: Promise<typeof clientConfig> | null = null;

export async function fetchAuthConfig(): Promise<{
  configured: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}> {
  if (clientConfig) return clientConfig;
  if (!configPromise) {
    configPromise = fetch('/api/auth/config')
      .then((res) => res.json())
      .then((data) => {
        clientConfig = data;
        if (data.configured && data.supabaseUrl && data.supabaseAnonKey) {
          clientInstance = createClient(data.supabaseUrl, data.supabaseAnonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
            },
          });
        }
        return clientConfig;
      })
      .catch((err) => {
        console.warn('Failed to load auth config:', err);
        clientConfig = { configured: false };
        return clientConfig;
      });
  }
  return configPromise;
}

export function getSupabaseClient(): SupabaseClient | null {
  return clientInstance;
}
