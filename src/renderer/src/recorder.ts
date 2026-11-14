/**
 * Records meeting audio as 16 kHz mono Float32 PCM (what Whisper expects).
 *
 * - System audio ("loopback": everyone in Zoom/Meet/Teams) comes from getDisplayMedia;
 *   the main process answers that request with `audio: 'loopback'` (Windows).
 * - Your microphone is optional and mixed in.
 */
export const SAMPLE_RATE = 16000
const MAX_SECONDS = 180

/**
 * Live mode voice detection: a segment is one stretch of speech, cut at a pause.
 * Frames are 4096 samples (256 ms at 16 kHz).
 */
const FRAME_SECONDS = 4096 / SAMPLE_RATE
const END_SILENCE_S = 0.8 // pause that ends a sentence
const MIN_SPEECH_S = 0.6 // ignore coughs and clicks
const MAX_SEGMENT_S = 15 // force a cut during long monologues

class VoiceSegmenter {
  private noise = 0.004
  private inSpeech = false
  private speechFrames = 0
  private silenceFrames = 0
  private frames: Float32Array[] = []
  private preRoll?: Float32Array

  constructor(private onSegment: (audio: Float32Array) => void) {}

  push(frame: Float32Array): void {
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
    const rms = Math.sqrt(sum / frame.length)
    // Speech = clearly louder than the running noise floor.
    const threshold = Math.max(0.01, this.noise * 3)
    const speech = rms > threshold

    if (!this.inSpeech) {
      if (!speech) {
        this.noise = this.noise * 0.95 + rms * 0.05 // learn the background level
        this.preRoll = frame
        return
      }
      this.inSpeech = true
      this.frames = this.preRoll ? [this.preRoll] : [] // keep the start of the first word
      this.speechFrames = 0
      this.silenceFrames = 0
    }
    this.frames.push(frame)
    if (speech) {
      this.speechFrames++
      this.silenceFrames = 0
    } else this.silenceFrames++

    const ended = this.silenceFrames * FRAME_SECONDS >= END_SILENCE_S
    const tooLong = this.frames.length * FRAME_SECONDS >= MAX_SEGMENT_S
    if (ended || tooLong) this.flush()
  }

  flush(): void {
    if (this.inSpeech && this.speechFrames * FRAME_SECONDS >= MIN_SPEECH_S) {
      this.onSegment(concat(this.frames))
    }
    this.inSpeech = false
    this.frames = []
    this.speechFrames = 0
    this.silenceFrames = 0
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export class Recorder {
  private ctx?: AudioContext
  private streams: MediaStream[] = []
  private processor?: ScriptProcessorNode
  private chunks: Float32Array[] = []
  private length = 0
  private segmenter?: VoiceSegmenter

  /** With onSegment set (live mode), audio is cut into speech segments instead of one clip. */
  async start(opts: { system: boolean; mic: boolean; onSegment?: (audio: Float32Array) => void }): Promise<void> {
    this.segmenter = opts.onSegment ? new VoiceSegmenter(opts.onSegment) : undefined
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
      const data = new Float32Array(e.inputBuffer.getChannelData(0))
      if (this.segmenter) {
        this.length += data.length // only used for the timer
        this.segmenter.push(data)
        return
      }
      if (this.length >= MAX_SECONDS * SAMPLE_RATE) return
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
    this.segmenter?.flush() // send the sentence that was in progress
    this.segmenter = undefined
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    await this.ctx?.close().catch(() => {})
    const out = concat(this.chunks)
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
