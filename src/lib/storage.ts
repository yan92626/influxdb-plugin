export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  if (globalThis.chrome?.storage?.local) {
    const obj = await chrome.storage.local.get(key)
    return (obj[key] as T) ?? fallback
  }
  const raw = localStorage.getItem(key)
  return raw ? (JSON.parse(raw) as T) : fallback
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [key]: value })
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}
