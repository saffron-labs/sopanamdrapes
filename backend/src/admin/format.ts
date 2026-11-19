const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const inr = (paise: number): string => `₹${inrFmt.format(Math.round(paise / 100))}`;
export const inrExact = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
export const when = (d: Date | string | null | undefined): string => (d ? dt.format(new Date(d)) : '–');
export const label = (s: string): string => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
/** <input type=datetime-local> value in IST. */
export const toLocalInput = (d: Date | null): string => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16) : '');
export const fromLocalInput = (v: string): Date | null => (v ? new Date(new Date(`${v}:00Z`).getTime() - 330 * 60_000) : null);
