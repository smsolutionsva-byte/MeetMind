/**
 * Records meeting audio as 16 kHz mono Float32 PCM (what Whisper expects).
 *
 * - System audio ("loopback": everyone in Zoom/Meet/Teams) comes from getDisplayMedia;
 *   the main process answers that request with `audio: 'loopback'` (Windows).
 * - Your microphone is optional and mixed in.
 */
export const SAMPLE_RATE = 16000
const MAX_SECONDS = 180

export class Recorder {
  private ctx?: AudioContext
  private streams: MediaStream[] = []
  private processor?: ScriptProcessorNode
  private chunks: Float32Array[] = []
  private length = 0

  async start(opts: { system: boolean; mic: boolean }): Promise<void> {
    if (!opts.system && !opts.mic) throw new Error('Turn on system audio or mic in settings')
    // Let the AudioContext resample everything to 16 kHz for us.
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    const mix = this.ctx.createGain()

    if (opts.system) {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      // We only want the audio; drop the video track straight away.
      display.getVideoTracks().forEach((t) => t.stop())
      if (!display.getAudioTracks().length) throw new Error('System audio capture is not available')
      this.streams.push(display)
      this.ctx.createMediaStreamSource(display).connect(mix)
    }
    if (opts.mic) {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
      this.streams.push(mic)
      this.ctx.createMediaStreamSource(mic).connect(mix)
    }

    // ScriptProcessor is deprecated but needs no extra worklet file and is fine at 16 kHz.
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (e) => {
      if (this.length >= MAX_SECONDS * SAMPLE_RATE) return
      const data = new Float32Array(e.inputBuffer.getChannelData(0))
      this.chunks.push(data)
      this.length += data.length
    }
    mix.connect(this.processor)
    // Must be connected to a destination to run; output is silent (we never write to it).
    this.processor.connect(this.ctx.destination)
  }

  /** Stops recording and returns all audio captured so far. */
  async stop(): Promise<Float32Array> {
    this.processor?.disconnect()
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    await this.ctx?.close().catch(() => {})
    const out = new Float32Array(this.length)
    let offset = 0
    for (const c of this.chunks) {
      out.set(c, offset)
      offset += c.length
    }
    this.chunks = []
    this.length = 0
    this.streams = []
    this.ctx = undefined
    this.processor = undefined
    return out
  }

  get seconds(): number {
    return this.length / SAMPLE_RATE
  }
}
