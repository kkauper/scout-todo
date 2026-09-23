import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret, secretHint } from '../../server/utils/secret-box'

const KEY = 'a'.repeat(32)
const OTHER_KEY = 'b'.repeat(32)

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext value', async () => {
    const stored = await encryptSecret('sk-ant-super-secret', KEY)
    await expect(decryptSecret(stored, KEY)).resolves.toBe('sk-ant-super-secret')
  })

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const a = await encryptSecret('same-secret', KEY)
    const b = await encryptSecret('same-secret', KEY)
    expect(a).not.toBe(b)
  })

  it('returns null when decrypting with the wrong key', async () => {
    const stored = await encryptSecret('sk-ant-super-secret', KEY)
    await expect(decryptSecret(stored, OTHER_KEY)).resolves.toBeNull()
  })

  it('returns null for tampered ciphertext', async () => {
    const stored = await encryptSecret('sk-ant-super-secret', KEY)
    const [prefix, iv, ciphertext] = stored.split(':')
    const tamperedChar = ciphertext![0] === 'a' ? 'b' : 'a'
    const tampered = `${prefix}:${iv}:${tamperedChar}${ciphertext!.slice(1)}`
    await expect(decryptSecret(tampered, KEY)).resolves.toBeNull()
  })

  it.each([
    '',
    'v1:x',
    'v2:a:b',
  ])('returns null for malformed stored value %s', async (stored) => {
    await expect(decryptSecret(stored, KEY)).resolves.toBeNull()
  })

  it('throws when encrypting with key material shorter than 32 chars', async () => {
    await expect(encryptSecret('secret', 'short-key')).rejects.toThrow()
  })
})

describe('secretHint', () => {
  it('returns an ellipsis plus the last 4 characters', () => {
    expect(secretHint('sk-ant-abcdef1234')).toBe('…1234')
  })
})
