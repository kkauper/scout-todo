import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createUser, setUserPassword } from '../server/db/users'
import * as schema from '../server/db/schema'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const [action, username] = process.argv.slice(2)

if ((action !== 'add' && action !== 'passwd') || !username) {
  console.error('Usage: tsx scripts/user.ts <add|passwd> <username>')
  process.exit(1)
}

const client = postgres(url, { max: 1 })
const db = drizzle(client, { schema })

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const lines = rl[Symbol.asyncIterator]()
  process.stdout.write('Password: ')
  const password = (await lines.next()).value ?? ''
  process.stdout.write('Repeat password: ')
  const repeat = (await lines.next()).value ?? ''
  rl.close()

  if (password !== repeat) {
    throw new Error('Passwords do not match')
  }

  if (action === 'add') {
    const user = await createUser(db, username as string, password)
    console.log(`Created user "${user.username}" (${user.id})`)
  }
  else {
    await setUserPassword(db, username as string, password)
    console.log(`Password updated for "${username}"`)
  }
}

main()
  .catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.end()
  })
