const rasterDataUrl = /^data:image\/(?:jpeg|png|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}

export function safeImageUrl(value, settings = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 12 * 1024 * 1024) return '';
  if (rasterDataUrl.test(value) && value.slice(value.indexOf(',') + 1).length > 0) return value;

  try {
    const configuredUrl = typeof settings === 'string' ? settings : settings.supabaseUrl;
    const configured = new URL(configuredUrl);
    const candidate = new URL(value);
    if (configured.protocol !== 'https:' || candidate.protocol !== 'https:' || candidate.origin !== configured.origin) return '';
    if (candidate.username || candidate.password || candidate.hash) return '';

    const bucket = typeof settings === 'object' ? settings.photoBucket : '';
    if (!/^[A-Za-z0-9_-]+$/.test(bucket || '')) return '';
    const prefix = `/storage/v1/object/sign/${encodeURIComponent(bucket)}/`;
    if (!candidate.pathname.startsWith(prefix) || !candidate.searchParams.get('token')) return '';
    if (/%2f|%5c|%2e|\\|\.\./i.test(candidate.pathname)) return '';
    if (!/\.(?:jpe?g|png|webp)$/i.test(candidate.pathname)) return '';
    return candidate.href;
  } catch {
    return '';
  }
}
