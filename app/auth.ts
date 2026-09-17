export const SESSION_COOKIE = 'hr_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(message: string) {
  const secret = process.env.HR_SESSION_SECRET;
  if (!secret) throw new Error('HR_SESSION_SECRET is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function createSessionToken() {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  return `${payload}.${encodeBase64Url(await hmac(payload))}`;
}

export async function verifySessionToken(token: string) {
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra || !constantTimeEqual(await hmac(payload), decodeBase64Url(signature))) return false;
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { sub?: string; exp?: number };
    return data.sub === 'admin' && typeof data.exp === 'number' && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function verifyAdminCredentials(username: string, password: string) {
  const configuredUsername = process.env.HR_ADMIN_USERNAME;
  const configuredHash = process.env.HR_ADMIN_PASSWORD_HASH;
  if (!configuredUsername || !configuredHash || username !== configuredUsername) return false;

  const [version, saltText, expectedText, extra] = configuredHash.split('.');
  if (version !== 'v2' || !saltText || !expectedText || extra) return false;
  const salt = decodeBase64Url(saltText);
  const passwordBytes = new TextEncoder().encode(password);
  const input = new Uint8Array(salt.length + passwordBytes.length);
  input.set(salt);
  input.set(passwordBytes, salt.length);
  const derived = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return constantTimeEqual(derived, decodeBase64Url(expectedText));
}
