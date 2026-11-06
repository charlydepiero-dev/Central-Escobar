/**
 * URL helper for Central de Pizzas Escobar.
 * - Development URL: https://ais-dev-kvpf7g46u3ovu6lcujhvt3-500242105075.us-west1.run.app
 * - Shared Public URL (for Employees/WhatsApp): https://ais-pre-kvpf7g46u3ovu6lcujhvt3-500242105075.us-west1.run.app
 */
export const SHARED_PUBLIC_URL = 'https://ais-pre-kvpf7g46u3ovu6lcujhvt3-500242105075.us-west1.run.app';
export const DEV_OWNER_URL = 'https://ais-dev-kvpf7g46u3ovu6lcujhvt3-500242105075.us-west1.run.app';

export function getPublicShareUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (origin.includes('ais-pre-')) {
      return origin;
    }
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  }
  return SHARED_PUBLIC_URL;
}

export function getPublicQrCodeUrl(size = 220): string {
  const publicUrl = encodeURIComponent(getPublicShareUrl());
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${publicUrl}&color=123D26`;
}
