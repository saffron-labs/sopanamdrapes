import type { AdminRole } from '@/db/schema';
import { forbidden } from './errors';

export const PERMISSIONS = [
  'orders.read', 'orders.update', 'orders.refund', 'orders.export',
  'catalog.read', 'catalog.write', 'stock.adjust',
  'customers.read', 'promos.write', 'reports.read',
  'settings.write', 'team.manage', 'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<AdminRole, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  manager: new Set<Permission>(['orders.read', 'orders.update', 'orders.refund', 'orders.export', 'catalog.read', 'catalog.write', 'stock.adjust', 'customers.read', 'promos.write', 'reports.read', 'audit.read']),
  staff: new Set<Permission>(['orders.read', 'orders.update', 'catalog.read', 'stock.adjust', 'customers.read']),
};

export const can = (role: AdminRole, p: Permission): boolean => MATRIX[role].has(p);

export function assertCan(role: AdminRole, p: Permission): void {
  if (!can(role, p)) throw forbidden();
}
