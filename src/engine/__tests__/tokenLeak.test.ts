import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero Token Leakage Security Suite (Stage 1a)', () => {
  it('confirms SUPABASE_SERVICE_ROLE_KEY is not exposed to client-side files', () => {
    // Scan all client-side source files in src/components and src/context
    const clientDirs = [
      path.resolve(process.cwd(), 'src/components'),
      path.resolve(process.cwd(), 'src/context'),
      path.resolve(process.cwd(), 'src/services/supabaseClient.ts'),
    ];

    const forbiddenTokens = ['SUPABASE_SERVICE_ROLE_KEY', 'service_role_key'];

    for (const dirOrFile of clientDirs) {
      if (fs.existsSync(dirOrFile)) {
        const stats = fs.statSync(dirOrFile);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(dirOrFile).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
          for (const file of files) {
            const content = fs.readFileSync(path.join(dirOrFile, file), 'utf8');
            for (const token of forbiddenTokens) {
              expect(content.includes(token), `Client file ${file} leaks ${token}`).toBe(false);
            }
          }
        } else {
          const content = fs.readFileSync(dirOrFile, 'utf8');
          for (const token of forbiddenTokens) {
            expect(content.includes(token), `Client file ${dirOrFile} leaks ${token}`).toBe(false);
          }
        }
      }
    }
  });

  it('verifies .env.example does not contain hardcoded secrets', () => {
    const envExamplePath = path.resolve(process.cwd(), '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const content = fs.readFileSync(envExamplePath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split('=');
      const val = parts[1]?.trim() || '';
      // .env.example must only have empty placeholders, no committed secret keys
      expect(val).toBe('');
    }
  });

  it('verifies that if dist/ exists, service role key variable is absent from client bundle', () => {
    const distAssetsPath = path.resolve(process.cwd(), 'dist/assets');
    if (fs.existsSync(distAssetsPath)) {
      const files = fs.readdirSync(distAssetsPath).filter((f) => f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(distAssetsPath, file), 'utf8');
        expect(content.includes('SUPABASE_SERVICE_ROLE_KEY')).toBe(false);
      }
    }
  });
});
