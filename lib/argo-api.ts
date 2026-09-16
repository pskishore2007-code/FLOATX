/** Server-only address for the private ARGO service. Render supplies host:port. */
export function argoApi(path: string): string {
  const configured = process.env.ARGO_API_URL || 'http://127.0.0.1:8000';
  const base = /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
  return new URL(path, `${base.replace(/\/+$/, '')}/`).toString();
}
