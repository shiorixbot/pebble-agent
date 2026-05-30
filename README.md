# Pebble Agent

A Pebble wrist client for quick phrase translation and agent chat.

## Modes

### Translate

Default mode. Press Select, speak a phrase, and the watch shows a translated answer and plays generated speech.

Flow:

1. Pebble Dictation converts speech to source text.
2. Phone-side PebbleKit JS calls OpenAI to translate that text.
3. The translated text is shown on the watch.
4. OpenAI TTS generates speech, which is streamed back to the watch as ADPCM chunks.

### Chat

Press Select, speak a prompt, and the watch sends it to an OpenResponses-compatible `/v1/responses` endpoint. The reply is shown on the watch and, if an OpenAI API key is configured, spoken with TTS.

This is agent-agnostic: any service that accepts an OpenResponses-style `POST /v1/responses` request can be used. OpenClaw works well here when its Responses HTTP endpoint is enabled.

For OpenClaw, set Chat model to `openclaw/default`. Gateway requirements:

- `gateway.http.endpoints.responses.enabled = true`
- reachable HTTPS URL from the paired phone
- gateway token/password if auth is enabled

## Configuration

Open the Pebble configuration page and set:

- Mode: `Translate phrase` or `Chat`
- OpenAI API key, required for Translate mode and optional TTS in Chat mode
- Target language, e.g. `Japanese`, `English`, `Chinese`, `Spanish`
- TTS voice
- Chat endpoint/base URL, token, model, and session/user key for Chat mode
  - OpenAI example: endpoint `https://api.openai.com`, model `gpt-4.1-mini`
  - OpenClaw example: endpoint your Gateway URL, model `openclaw/default`
- Optional custom translation instructions

## Current status

Prototype scaffold. The first target is phrase translation plus agent prompt/response, not continuous realtime audio.

OpenAI Realtime translation needs a streamed microphone audio source. Pebble's public Dictation API returns final text, not raw live audio, so true realtime translation likely needs a phone-side companion/WebRTC path later.

## Build

Requires a Pebble/Rebble SDK environment.

```bash
npm install
pebble build
```

## Credits

Inspired by Eric McCormick's `Pebble_Gemini` project.

## Notes

The watch receives 8 kHz audio chunks encoded as IMA ADPCM to keep BLE transfers small. The phone-side JS requests PCM audio from OpenAI TTS, downsamples to 8 kHz, encodes to ADPCM, and sends chunks through AppMessage.
