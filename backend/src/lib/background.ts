import { after } from 'next/server';

/**
 * Runs work after the response is sent. On serverless hosts a bare un-awaited promise can be frozen or killed
 * once the response goes out, so emails would silently go missing; `after` keeps the function alive until done.
 * Outside a request (tests, scripts) it simply runs the task.
 */
export function background(label: string, task: () => Promise<unknown>): void {
  const run = () => task().catch((e) => console.error(`[${label}]`, e instanceof Error ? e.message : e));
  try { after(run); } catch { void run(); }
}
