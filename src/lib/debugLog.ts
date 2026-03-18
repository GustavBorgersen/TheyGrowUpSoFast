const KEY = '_dbg'
const MAX = 60

export function dbg(msg: string) {
  try {
    const entries: string[] = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    entries.push(`${new Date().toISOString().slice(11, 23)} ${msg}`)
    if (entries.length > MAX) entries.splice(0, entries.length - MAX)
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {}
}

export function getDbgLog(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function clearDbgLog() {
  try { localStorage.removeItem(KEY) } catch {}
}
