import type { Db } from '@/db/client';
import { addresses, customers, ornaments, sarees, settings } from '@/db/schema';

export const R = (rupees: number) => rupees * 100;

/** A slice of the real catalogue (same ids, prices and discounts as the live site). */
export async function seedCatalogue(d: Db) {
  await d.insert(sarees).values([
    { id: 'SA00001', name: 'Banarasi Silk Saree', colour: 'Royal Maroon', fabric: 'Banarasi Silk', mrpPaise: R(8999), discountPercent: 10, stock: 17, status: 'active' },
    { id: 'SA00002', name: 'Kanjivaram Silk Saree', colour: 'Emerald Green', fabric: 'Kanjivaram Silk', mrpPaise: R(12999), discountPercent: 0, stock: 10, status: 'active' },
    { id: 'SA00006', name: 'Georgette Party Saree', colour: 'Wine', fabric: 'Georgette', mrpPaise: R(3599), discountPercent: 20, stock: 16, status: 'active' },
    { id: 'SA00007', name: 'Kasavu Cotton Saree', colour: 'Ivory & Gold', fabric: 'Kasavu Cotton', mrpPaise: R(2999), stock: 25, status: 'active' },
    { id: 'SA00099', name: 'Last Piece Saree', mrpPaise: R(5000), stock: 1, status: 'active' },
    { id: 'SA00098', name: 'Draft Saree', mrpPaise: R(5000), stock: 5, status: 'draft' },
  ]);
  await d.insert(ornaments).values([
    { id: 'OR00001', slot: 'necklace', name: 'Temple Kundan Necklace', mrpPaise: R(2499), stock: 22, status: 'active' },
    { id: 'OR00003', slot: 'necklace', name: 'Polki Choker Necklace', mrpPaise: R(4999), stock: 7, status: 'active' },
    { id: 'OR00004', slot: 'bangles', name: 'Gold Plated Bangles, set of 2', mrpPaise: R(1299), stock: 23, status: 'active' },
    { id: 'OR00006', slot: 'bangles', name: 'Pearl Studded Bangles', mrpPaise: R(2199), discountPercent: 15, stock: 18, status: 'active' },
    { id: 'OR00007', slot: 'earrings', name: 'Jhumka Earrings', mrpPaise: R(899), stock: 30, status: 'active' },
    { id: 'OR00009', slot: 'earrings', name: 'Kundan Stud Earrings', mrpPaise: R(799), stock: 33, status: 'active' },
    { id: 'OR00014', slot: 'anklet', name: 'Temple Anklet Pair', mrpPaise: R(1499), stock: 16, status: 'active' },
    { id: 'OR00098', slot: 'ring', name: 'Draft Ring', mrpPaise: R(599), stock: 5, status: 'draft' },
  ]);
}

export async function makeCustomer(d: Db, phone = '+919876543210') {
  const [c] = await d.insert(customers).values({ phone, name: 'Asha', email: 'asha@example.com' }).returning();
  const [a] = await d.insert(addresses).values({ customerId: c!.id, name: 'Asha K', phone, line1: '12 Temple Road', city: 'Kochi', state: 'Kerala', pincode: '682001' }).returning();
  return { customer: { id: c!.id, phone, email: 'asha@example.com' as string | null }, addressId: a!.id };
}

export async function setSetting(d: Db, key: string, value: unknown) {
  await d.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
