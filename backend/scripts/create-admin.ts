// Usage: npm run admin:create -- owner@example.com "Full Name" owner
// Prints the password and the 2FA secret ONCE. Scan the otpauth URI (or type the secret) into an authenticator app.
import { db } from '../src/db/client';
import { createAdminUser } from '../src/services/admin-users';
import { ADMIN_ROLES, type AdminRole } from '../src/db/schema';

const [email, name, role = 'owner'] = process.argv.slice(2);
if (!email || !name || !(ADMIN_ROLES as readonly string[]).includes(role)) {
  console.error('Usage: npm run admin:create -- <email> "<Full Name>" [owner|manager|staff]');
  process.exit(1);
}
const c = await createAdminUser(db(), null, { email, name, role: role as AdminRole });
console.log('\nAdmin created. Save these now; they are not shown again.\n');
console.log(`  Email:        ${c.email}\n  Password:     ${c.password}\n  2FA secret:   ${c.totpSecret}\n  2FA otpauth:  ${c.otpauthUri}\n`);
console.log('Sign in at /admin/login, then change the password from the Team page.');
process.exit(0);
