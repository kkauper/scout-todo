import { describe, it, expect } from 'vitest'
import { normalizeUsername, validatePassword } from '../../server/db/users'

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Alice ')).toBe('alice')
  })

  it('throws on invalid characters', () => {
    expect(() => normalizeUsername('bad name')).toThrow()
  })

  it('throws on empty username', () => {
    expect(() => normalizeUsername('')).toThrow()
  })

  it('throws on usernames longer than 64 characters', () => {
    expect(() => normalizeUsername('a'.repeat(65))).toThrow()
  })
})

describe('validatePassword', () => {
  it('throws for passwords shorter than 8 characters', () => {
    expect(() => validatePassword('1234567')).toThrow()
  })

  it('accepts an 8 character password', () => {
    expect(() => validatePassword('12345678')).not.toThrow()
  })

  it('throws for passwords longer than 1000 characters', () => {
    expect(() => validatePassword('a'.repeat(1001))).toThrow()
  })
})
