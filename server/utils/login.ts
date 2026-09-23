import { checkPasswordHash, createPasswordHash } from './password'

let dummyHash: Promise<string> | undefined

export async function verifyCredentials(
  user: { passwordHash: string | null } | undefined,
  password: string,
): Promise<boolean> {
  if (!user || user.passwordHash === null) {
    if (!dummyHash) dummyHash = createPasswordHash(globalThis.crypto.randomUUID())
    await checkPasswordHash(password, await dummyHash)
    return false
  }
  return checkPasswordHash(password, user.passwordHash)
}
