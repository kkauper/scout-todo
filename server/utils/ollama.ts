export function ollamaConfig(): { url: string; model: string } {
  return {
    url: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL ?? 'qwen3:8b',
  }
}

function stripThink(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

function modelMatches(installed: string, wanted: string): boolean {
  if (installed === wanted) return true
  const withLatest = wanted.includes(':') ? wanted : `${wanted}:latest`
  const withoutLatest = wanted.endsWith(':latest') ? wanted.slice(0, -':latest'.length) : wanted
  return installed === withLatest || installed === withoutLatest
}

export async function ollamaStatus(): Promise<{ available: boolean; model: string; modelInstalled: boolean }> {
  const { url, model } = ollamaConfig()
  if (url === '') return { available: false, model, modelInstalled: false }
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return { available: false, model, modelInstalled: false }
    const data = (await res.json()) as { models?: { name: string }[] }
    const names = data.models?.map(m => m.name) ?? []
    const modelInstalled = names.some(name => modelMatches(name, model))
    return { available: true, model, modelInstalled }
  }
  catch {
    return { available: false, model, modelInstalled: false }
  }
}

export async function ollamaChat(input: {
  system: string
  user: string
  format?: Record<string, unknown>
  temperature?: number
}): Promise<string> {
  const { url, model } = ollamaConfig()
  if (url === '') throw createError({ statusCode: 503, statusMessage: 'AI is disabled in this deployment' })

  let res: Response
  try {
    res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        ...(input.format ? { format: input.format } : {}),
        options: { temperature: input.temperature ?? 0.4 },
      }),
      signal: AbortSignal.timeout(90_000),
    })
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Local AI unavailable — is Ollama running?' })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({ statusCode: 502, statusMessage: text || 'Ollama error' })
  }

  const data = (await res.json()) as { message?: { content?: string } }
  const content = data.message?.content ?? ''
  return stripThink(content)
}
