import type { ReactNode } from 'react';
import { label } from '@/admin/format';

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

/** Messages come from our own redirects, but are rendered as text only, never HTML. */
export const Flash = ({ ok, err }: { ok?: string; err?: string }) => (ok ? <div className="flash ok" role="status">{ok.slice(0, 300)}</div> : err ? <div className="flash err" role="alert">{err.slice(0, 300)}</div> : null);
export const Badge = ({ v }: { v: string }) => <span className={`badge b-${v}`}>{label(v)}</span>;
export const Head = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="head"><div><h1>{title}</h1>{sub ? <div className="sub">{sub}</div> : null}</div><div className="actions">{children}</div></div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Pager({ base, page, pages }: { base: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${base}${base.includes('?') ? '&' : '?'}page=${p}`;
  return (
    <div className="pager">
      {page > 1 ? <a className="btn ghost sm" href={href(page - 1)}>Previous</a> : null}
      <span>Page {page} of {pages}</span>
      {page < pages ? <a className="btn ghost sm" href={href(page + 1)}>Next</a> : null}
    </div>
  );
}

export const Field = ({ name, label: l, hint, children }: { name: string; label: string; hint?: string; children: ReactNode }) => (
  <div className="field"><label htmlFor={name}>{l} {hint ? <span className="hint">{hint}</span> : null}</label>{children}</div>
);
export const queryString = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ''; };
