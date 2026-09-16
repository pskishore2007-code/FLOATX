export function argoApi(path: string): string {
  const configured = process.env.ARGO_API_URL || 'http://127.0.0.1:8000';
  let base = configured;
  if (!/^https?:\/\//i.test(base)) {
    base = base.includes('localhost') || base.includes('127.0.0.1') ? `http://${base}` : `https://${base}`;
  }
  return new URL(path, `${base.replace(/\/+$/, '')}/`).toString();
}
