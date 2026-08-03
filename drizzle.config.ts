import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const envPath = '.env.local'
  if (existsSync(envPath)) {
    const matches = [...readFileSync(envPath, 'utf8').matchAll(/^DATABASE_URL=(.*)$/gm)]
    const databaseUrl = matches.at(-1)?.[1]
    if (databaseUrl) return databaseUrl.trim().replace(/^['"]|['"]$/g, '')
  }

  throw new Error('DATABASE_URL is not set. Add it to .env.local or the environment.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: readDatabaseUrl(),
  },
})
