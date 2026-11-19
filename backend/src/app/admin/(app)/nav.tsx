'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return <>{links.map((l) => {
    const on = l.href === '/admin' ? path === '/admin' : path.startsWith(l.href);
    return <Link key={l.href} href={l.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>{l.label}</Link>;
  })}</>;
}
