import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { API_PROVIDERS, type ApiProvider } from '../shared/types'

/**
 * API keys, encrypted with the OS keychain (DPAPI on Windows) via safeStorage.
 * Stored apart from settings.json and never sent to any renderer.
 */
const file = () => join(app.getPath('userData'), 'keys.json')
type Store = Partial<Record<ApiProvider, string>> // base64 ciphertext

function read(): Store {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Store
  } catch {
    return {}
  }
}

function write(store: Store): void {
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(store, null, 2))
}

export function setKey(provider: ApiProvider, key: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system')
  const store = read()
  const trimmed = key.trim()
  if (trimmed) store[provider] = safeStorage.encryptString(trimmed).toString('base64')
  else delete store[provider]
  write(store)
}

export function getKey(provider: ApiProvider): string | undefined {
  const enc = read()[provider]
  if (!enc) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return undefined
  }
}

export function keysSet(): Record<ApiProvider, boolean> {
  const store = read()
  return Object.fromEntries(API_PROVIDERS.map((p) => [p.id, !!store[p.id]])) as Record<ApiProvider, boolean>
}
