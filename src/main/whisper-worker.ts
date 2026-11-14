/**
 * Local speech-to-text with Whisper (transformers.js + onnxruntime-node).
 * Runs in a worker thread so transcription never freezes the app.
 * Models download once from Hugging Face into <userData>/models.
 */
import { parentPort, workerData } from 'worker_threads'
import { env, pipeline } from '@huggingface/transformers'

type Msg =
  | { type: 'transcribe'; id: number; model: string; audio: Float32Array; language?: string }
  | { type: 'preload'; model: string }

env.cacheDir = (workerData as { cacheDir: string }).cacheDir
env.allowLocalModels = false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let current: { model: string; asr: Promise<any> } | undefined

function load(model: string) {
  if (current?.model === model) return current.asr
  const files = new Map<string, number>()
  const asr = pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return
      files.set(p.file, (p.loaded ?? 0) / p.total)
      // Report the average across files; good enough for a status line.
      const pct = Math.round(([...files.values()].reduce((a, b) => a + b, 0) / files.size) * 100)
      parentPort!.postMessage({ type: 'progress', pct })
    }
  })
  current = { model, asr }
  asr.catch(() => {
    if (current?.asr === asr) current = undefined
  })
  return asr
}

parentPort!.on('message', async (msg: Msg) => {
  if (msg.type === 'preload') {
    load(msg.model).catch(() => {})
    return
  }
  try {
    const asr = await load(msg.model)
    const out = await asr(msg.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(msg.language ? { language: msg.language, task: 'transcribe' } : {})
    })
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text) as string
    parentPort!.postMessage({ type: 'result', id: msg.id, text: text.trim() })
  } catch (err) {
    parentPort!.postMessage({ type: 'error', id: msg.id, error: (err as Error).message })
  }
})
