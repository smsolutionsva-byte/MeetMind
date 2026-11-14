/**
 * "Use your own API key" mode: ask Claude, OpenAI or Gemini directly and stream the answer
 * into MeetMind's own Answers panel. Keys stay in the main process.
 */
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import type { NativeImage } from 'electron'
import type { ApiProvider } from '../shared/types'

const SYSTEM =
  'You are a discreet assistant helping someone during a live meeting. They will read your answer ' +
  'off screen while others wait, so be brief: lead with the answer in plain spoken language, no ' +
  'preamble, no headings, at most a few short sentences unless asked for more.'

export interface AskInput {
  provider: ApiProvider
  model: string
  apiKey: string
  text: string
  image?: NativeImage
}

/** Downscale and JPEG-encode screenshots: smaller uploads, faster answers, same readability. */
function encodeImage(image: NativeImage): string {
  const { width } = image.getSize()
  const scaled = width > 1600 ? image.resize({ width: 1600, quality: 'best' }) : image
  return scaled.toJPEG(85).toString('base64')
}

/** Streams answer text through onDelta; resolves when finished, rejects with a readable message. */
export async function streamAnswer(input: AskInput, onDelta: (text: string) => void): Promise<void> {
  const text = input.text.trim() || 'Explain what is on this screen.'
  const image = input.image ? encodeImage(input.image) : undefined
  try {
    if (input.provider === 'anthropic') return await anthropic(input, text, image, onDelta)
    if (input.provider === 'openai') return await openai(input, text, image, onDelta)
    return await gemini(input, text, image, onDelta)
  } catch (err) {
    throw new Error(friendlyError(input.provider, err))
  }
}

async function anthropic(input: AskInput, text: string, image: string | undefined, onDelta: (t: string) => void) {
  const client = new Anthropic({ apiKey: input.apiKey })
  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } })
  content.push({ type: 'text', text })
  const stream = client.beta.messages.stream({
    model: input.model,
    max_tokens: 8000,
    // Low effort: answers are read mid-conversation, so speed matters more than depth.
    output_config: { effort: 'low' },
    // If a request is declined by a safety classifier, let the API retry on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content }]
  })
  stream.on('text', (delta) => onDelta(delta))
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new Error('Claude declined to answer this one.')
}

async function openai(input: AskInput, text: string, image: string | undefined, onDelta: (t: string) => void) {
  const client = new OpenAI({ apiKey: input.apiKey })
  const content: OpenAI.Responses.ResponseInputContent[] = [{ type: 'input_text', text }]
  if (image) content.unshift({ type: 'input_image', image_url: `data:image/jpeg;base64,${image}`, detail: 'auto' })
  const stream = await client.responses.create({
    model: input.model,
    instructions: SYSTEM,
    input: [{ role: 'user', content }],
    stream: true
  })
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') onDelta(event.delta)
    else if (event.type === 'error') throw new Error(event.message)
  }
}

async function gemini(input: AskInput, text: string, image: string | undefined, onDelta: (t: string) => void) {
  const ai = new GoogleGenAI({ apiKey: input.apiKey })
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = []
  if (image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } })
  parts.push({ text })
  const stream = await ai.models.generateContentStream({
    model: input.model,
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: SYSTEM }
  })
  for await (const chunk of stream) {
    if (chunk.text) onDelta(chunk.text)
  }
}

function friendlyError(provider: ApiProvider, err: unknown): string {
  const name = provider === 'anthropic' ? 'Claude' : provider === 'openai' ? 'OpenAI' : 'Gemini'
  if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError)
    return `${name} rejected the API key. Check it in Settings.`
  if (err instanceof Anthropic.RateLimitError || err instanceof OpenAI.RateLimitError)
    return `${name} rate limit or credit limit hit. Try again in a moment.`
  if (err instanceof Anthropic.NotFoundError || err instanceof OpenAI.NotFoundError)
    return `${name} doesn't know that model name. Check the model in Settings.`
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError)
    return `Couldn't reach ${name}. Check your internet connection.`
  const msg = err instanceof Error ? err.message : String(err)
  if (/api key|API_KEY_INVALID|permission/i.test(msg)) return `${name} rejected the API key. Check it in Settings.`
  return `${name}: ${msg.slice(0, 200)}`
}
