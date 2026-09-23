const PREFIX = 'pbkdf2-sha256'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  catch {
    return null
  }
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function createPasswordHash(password: string, iterations = 100_000): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const derived = await deriveBits(password, salt, iterations)
  return `${PREFIX}:${iterations}:${toBase64Url(salt)}:${toBase64Url(derived)}`
}

export async function checkPasswordHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 4) return false
  const [prefix, iterationsRaw, saltB64, hashB64] = parts
  if (prefix !== PREFIX) return false
  if (!/^[0-9]+$/.test(iterationsRaw!)) return false
  const iterations = Number.parseInt(iterationsRaw!, 10)
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) return false
  const salt = fromBase64Url(saltB64!)
  const expected = fromBase64Url(hashB64!)
  if (!salt || !expected) return false
  const derived = await deriveBits(password, salt, iterations)
  return timingSafeEqual(derived, expected)
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function sha256(text: string): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return new Uint8Array(digest)
}
