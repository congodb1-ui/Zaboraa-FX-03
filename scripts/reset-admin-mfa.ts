import { resetUserMfaFactor, isSupabaseConfigured } from '../src/services/supabaseServer';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run admin:reset-mfa -- <email>');
    process.exit(1);
  }

  if (!isSupabaseConfigured) {
    console.error('Error: Supabase is not configured in .env');
    process.exit(1);
  }

  console.log(`Attempting to reset MFA factors for: ${email}...`);
  const result = await resetUserMfaFactor(email);
  if (result.success) {
    console.log(`Success: ${result.message}`);
    process.exit(0);
  } else {
    console.error(`Failed: ${result.message}`);
    process.exit(1);
  }
}

main();
