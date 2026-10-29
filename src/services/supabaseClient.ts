import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AuthConfig {
  configured: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

let clientInstance: SupabaseClient | null = null;
let clientConfig: AuthConfig | null = null;
let configPromise: Promise<AuthConfig> | null = null;

export async function fetchAuthConfig(): Promise<AuthConfig> {
  if (clientConfig) return clientConfig;
  if (!configPromise) {
    configPromise = fetch('/api/auth/config')
      .then((res) => res.json())
      .then((data) => {
        const conf: AuthConfig = {
          configured: Boolean(data?.configured),
          supabaseUrl: data?.supabaseUrl,
          supabaseAnonKey: data?.supabaseAnonKey,
        };
        clientConfig = conf;
        if (conf.configured && conf.supabaseUrl && conf.supabaseAnonKey) {
          clientInstance = createClient(conf.supabaseUrl, conf.supabaseAnonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
            },
          });
        }
        return conf;
      })
      .catch((err) => {
        console.warn('Failed to load auth config:', err);
        const fallback: AuthConfig = { configured: false };
        clientConfig = fallback;
        return fallback;
      });
  }
  return configPromise;
}

export function getSupabaseClient(): SupabaseClient | null {
  return clientInstance;
}
