import { describe, it, expect } from 'vitest'
import { verifyCredentials } from '../../server/utils/login'
import { createPasswordHash } from '../../server/utils/password'

describe('verifyCredentials', () => {
  it('returns false for an undefined user', async () => {
    await expect(verifyCredentials(undefined, 'anything')).resolves.toBe(false)
  })

  it('returns false for a user with a null password hash', async () => {
    await expect(verifyCredentials({ passwordHash: null }, 'anything')).resolves.toBe(false)
  })

  it('returns true for the correct password', async () => {
    const passwordHash = await createPasswordHash('correct password', 1000)
    await expect(verifyCredentials({ passwordHash }, 'correct password')).resolves.toBe(true)
  })

  it('returns false for the wrong password', async () => {
    const passwordHash = await createPasswordHash('correct password', 1000)
    await expect(verifyCredentials({ passwordHash }, 'wrong password')).resolves.toBe(false)
  })
})
