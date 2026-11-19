import type { ReactNode } from 'react';
import { requireAdmin } from '@/admin/session';
import { can, type Permission } from '@/lib/rbac';
import { logoutAction } from '../actions';
import { Nav } from './nav';

const LINKS: { href: string; label: string; perm: Permission }[] = [
  { href: '/admin', label: 'Dashboard', perm: 'reports.read' },
  { href: '/admin/orders', label: 'Orders', perm: 'orders.read' },
  { href: '/admin/catalog', label: 'Catalogue', perm: 'catalog.read' },
  { href: '/admin/customers', label: 'Customers', perm: 'customers.read' },
  { href: '/admin/promos', label: 'Promo codes', perm: 'orders.read' },
  { href: '/admin/settings', label: 'Settings', perm: 'settings.write' },
  { href: '/admin/team', label: 'Team', perm: 'orders.read' },
  { href: '/admin/audit', label: 'Activity log', perm: 'audit.read' },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAdmin();
  const links = LINKS.filter((l) => can(ctx.role, l.perm));
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Sopanam Drapes<small>Admin</small></div>
        <Nav links={links.map(({ href, label }) => ({ href, label }))} />
        <div className="who">{ctx.email}<br />{ctx.role}
          <form action={logoutAction}><button className="btn ghost sm" style={{ color: '#e9dfcf', borderColor: '#ffffff44' }} type="submit">Sign out</button></form>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
