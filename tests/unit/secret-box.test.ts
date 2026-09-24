import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret, secretHint } from '../../server/utils/secret-box'

const KEY = 'a'.repeat(32)
const OTHER_KEY = 'b'.repeat(32)
const CONTEXT = 'user-a'
const OTHER_CONTEXT = 'user-b'

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext value', async () => {
    const stored = await encryptSecret('sk-ant-super-secret', KEY, CONTEXT)
    await expect(decryptSecret(stored, KEY, CONTEXT)).resolves.toBe('sk-ant-super-secret')
  })

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const a = await encryptSecret('same-secret', KEY, CONTEXT)
    const b = await encryptSecret('same-secret', KEY, CONTEXT)
    expect(a).not.toBe(b)
  })

  it('returns null when decrypting with the wrong key', async () => {
    const stored = await encryptSecret('sk-ant-super-secret', KEY, CONTEXT)
    await expect(decryptSecret(stored, OTHER_KEY, CONTEXT)).resolves.toBeNull()
  })

  it('returns null when decrypting with a different context (user)', async () => {
    const stored = await encryptSecret('sk-ant-super-secret', KEY, CONTEXT)
    await expect(decryptSecret(stored, KEY, OTHER_CONTEXT)).resolves.toBeNull()
  })

  it('returns null for a legacy v1 value (not bound to a user)', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(KEY))
    const cryptoKey = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cryptoKey, new TextEncoder().encode('sk-ant-super-secret'))
    const toB64Url = (bytes: Uint8Array) => {
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    const stored = `v1:${toB64Url(iv)}:${toB64Url(new Uint8Array(ciphertext))}`
    await expect(decryptSecret(stored, KEY, CONTEXT)).resolves.toBeNull()
  })

  it('returns null for tampered ciphertext', async () => {
    const stored = await encryptSecret('sk-ant-super-secret', KEY, CONTEXT)
    const [prefix, iv, ciphertext] = stored.split(':')
    const tamperedChar = ciphertext![0] === 'a' ? 'b' : 'a'
    const tampered = `${prefix}:${iv}:${tamperedChar}${ciphertext!.slice(1)}`
    await expect(decryptSecret(tampered, KEY, CONTEXT)).resolves.toBeNull()
  })

  it.each([
    '',
    'v1:x',
    'v2:a:b',
  ])('returns null for malformed stored value %s', async (stored) => {
    await expect(decryptSecret(stored, KEY, CONTEXT)).resolves.toBeNull()
  })

  it('throws when encrypting with key material shorter than 32 chars', async () => {
    await expect(encryptSecret('secret', 'short-key', CONTEXT)).rejects.toThrow()
  })
})

describe('secretHint', () => {
  it('returns an ellipsis plus the last 4 characters', () => {
    expect(secretHint('sk-ant-abcdef1234')).toBe('…1234')
  })
})
