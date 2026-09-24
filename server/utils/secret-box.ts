const PREFIX = 'v2'

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

async function deriveAesKey(keyMaterial: string): Promise<CryptoKey> {
  if (keyMaterial.length < 32) {
    throw new Error('keyMaterial must be at least 32 characters')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyMaterial))
  return globalThis.crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plain: string, keyMaterial: string, context: string): Promise<string> {
  const key = await deriveAesKey(keyMaterial)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(plain),
  )
  return `${PREFIX}:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(ciphertext))}`
}

// v1 values weren't bound to a user and are rejected on purpose, so users re-enter their key once.
export async function decryptSecret(stored: string, keyMaterial: string, context: string): Promise<string | null> {
  const parts = stored.split(':')
  if (parts.length !== 3) return null
  const [prefix, ivB64, ciphertextB64] = parts
  if (prefix !== PREFIX) return null

  const iv = fromBase64Url(ivB64!)
  const ciphertext = fromBase64Url(ciphertextB64!)
  if (!iv || !ciphertext) return null

  try {
    const key = await deriveAesKey(keyMaterial)
    const plainBytes = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: new TextEncoder().encode(context) },
      key,
      ciphertext as BufferSource,
    )
    return new TextDecoder().decode(plainBytes)
  }
  catch {
    return null
  }
}

export function secretHint(plain: string): string {
  return `…${plain.slice(-4)}`
}
