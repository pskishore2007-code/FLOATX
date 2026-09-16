export function argoApi(path: string): string {
  let configured = process.env.ARGO_API_URL || 'http://127.0.0.1:8000';
  configured = configured.trim();

  // If Render passed internal service name 'floatx-api' without domain
  if (configured === 'floatx-api' || configured === 'http://floatx-api' || configured === 'https://floatx-api') {
    configured = 'https://floatx-api.onrender.com';
  } else if (!configured.includes('.') && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
    configured = `https://${configured.replace(/^https?:\/\//, '')}.onrender.com`;
  }

  let base = configured;
  if (!/^https?:\/\//i.test(base)) {
    base = base.includes('localhost') || base.includes('127.0.0.1') ? `http://${base}` : `https://${base}`;
  }
  return new URL(path, `${base.replace(/\/+$/, '')}/`).toString();
}
