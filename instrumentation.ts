export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { loadConfig } = await import('./lib/config');
  loadConfig();
  const { startPostmasterAutoSync } = await import('./lib/google/schedule');
  startPostmasterAutoSync();
}
