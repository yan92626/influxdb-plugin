export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  if (globalThis.chrome?.storage?.local) {
    const obj = await chrome.storage.local.get(key)
    return (obj[key] as T) ?? fallback
  }
  const raw = localStorage.getItem(key)
  return raw ? (JSON.parse(raw) as T) : fallback
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  // Vue reactive Proxy 无法被 chrome.storage 结构化克隆，统一先转纯 JSON 值
  const plain = value === undefined ? value : JSON.parse(JSON.stringify(value))
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [key]: plain })
    return
  }
  localStorage.setItem(key, JSON.stringify(plain))
}
