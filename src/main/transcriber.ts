import { app } from 'electron'
import { join } from 'path'
import { Worker } from 'worker_threads'

/** Main-process handle to the Whisper worker thread. */
export class Transcriber {
  private worker?: Worker
  private nextId = 1
  private pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()

  constructor(private onProgress: (pct: number) => void) {}

  private get w(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(join(__dirname, 'whisper-worker.js'), {
      workerData: { cacheDir: join(app.getPath('userData'), 'models') }
    })
    worker.on('message', (m: { type: string; id?: number; text?: string; error?: string; pct?: number }) => {
      if (m.type === 'progress') return this.onProgress(m.pct ?? 0)
      const p = this.pending.get(m.id!)
      if (!p) return
      this.pending.delete(m.id!)
      if (m.type === 'result') p.resolve(m.text ?? '')
      else p.reject(new Error(m.error ?? 'Transcription failed'))
    })
    worker.on('error', (err: Error) => this.failAll(err))
    worker.on('exit', () => {
      this.worker = undefined
      this.failAll(new Error('Speech engine stopped'))
    })
    this.worker = worker
    return worker
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
  }

  /** Start downloading/loading the model in the background (e.g. when recording starts). */
  preload(model: string): void {
    this.w.postMessage({ type: 'preload', model })
  }

  transcribe(audio: Float32Array, model: string, language?: string): Promise<string> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.w.postMessage({ type: 'transcribe', id, model, audio, language }, [audio.buffer as ArrayBuffer])
    })
  }

  dispose(): void {
    void this.worker?.terminate()
  }
}
