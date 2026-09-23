import { describe, it, expect } from 'vitest'
import { createPasswordHash, checkPasswordHash, timingSafeEqual } from '../../server/utils/password'

describe('createPasswordHash', () => {
  it('produces the expected format with no $', async () => {
    const hash = await createPasswordHash('correct horse battery staple')
    expect(hash).toMatch(/^pbkdf2-sha256:100000:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
    expect(hash).not.toContain('$')
  })

  it('produces different hashes for the same password (different salt)', async () => {
    const a = await createPasswordHash('same-password', 1000)
    const b = await createPasswordHash('same-password', 1000)
    expect(a).not.toBe(b)
  })

  it('hashes an empty-string password and rejects a non-empty check', async () => {
    const hash = await createPasswordHash('', 1000)
    await expect(checkPasswordHash('x', hash)).resolves.toBe(false)
  })
})

describe('checkPasswordHash', () => {
  it('returns true for the correct password', async () => {
    const hash = await createPasswordHash('correct password', 1000)
    await expect(checkPasswordHash('correct password', hash)).resolves.toBe(true)
  })

  it('returns false for the wrong password', async () => {
    const hash = await createPasswordHash('correct password', 1000)
    await expect(checkPasswordHash('wrong password', hash)).resolves.toBe(false)
  })

  it.each([
    '',
    'garbage',
    'bcrypt:1:a:b',
    'pbkdf2-sha256:abc:a:b',
    'pbkdf2-sha256:0:a:b',
    'pbkdf2-sha256:999999999:a:b',
  ])('returns false without throwing for malformed stored value %s', async (stored) => {
    await expect(checkPasswordHash('anything', stored)).resolves.toBe(false)
  })
})

describe('timingSafeEqual', () => {
  it('returns true for equal arrays', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
  })

  it('returns false for different content', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
  })

  it('returns false for different length', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false)
  })
})
