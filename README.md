# OpenClaw Wrist for Pebble

A Pebble wrist client for phrase translation and OpenClaw voice prompts.

Translate mode flow:

1. Press Select on the watch.
2. Pebble Dictation converts speech to source text.
3. The phone-side PebbleKit JS calls OpenAI to translate that text.
4. The translated text is shown on the watch.
5. OpenAI TTS generates speech, which is streamed back to the watch as ADPCM chunks.

This is intentionally **not** a fork of `ericlmccormick/Pebble_Gemini`, because that repository currently has no license. It uses the same product idea — a Pebble voice assistant/translator — but this codebase is a clean MIT-licensed implementation.

## Current status

Prototype scaffold. The first target is phrase translation plus OpenClaw prompt/response, not continuous realtime audio.

OpenAI Realtime translation needs a streamed microphone audio source. Pebble's public Dictation API returns final text, not raw live audio, so true realtime translation likely needs a phone-side companion/WebRTC path later.

## Modes

### Translate

Uses Pebble Dictation, OpenAI text translation, and OpenAI TTS.

### Ask OpenClaw

Uses Pebble Dictation, sends the text to an OpenClaw Gateway `POST /v1/responses` endpoint, displays the reply, and speaks it if an OpenAI API key is also configured for TTS.

OpenClaw Gateway requirements:

- `gateway.http.endpoints.responses.enabled = true`
- reachable HTTPS URL from the paired phone
- gateway token/password if auth is enabled

## Configuration

Open the Pebble configuration page and set:

- Mode: `Translate phrase` or `Ask OpenClaw`
- OpenAI API key, required for Translate mode and optional TTS in OpenClaw mode
- Target language, e.g. `Japanese`, `English`, `Chinese`, `Spanish`
- TTS voice
- OpenClaw Gateway URL/token/agent/session for OpenClaw mode
- Optional custom translation instructions

## Build

Requires a Pebble/Rebble SDK environment.

```bash
npm install
pebble build
```

## Notes

The watch receives 8 kHz audio chunks encoded as IMA ADPCM to keep BLE transfers small. The phone-side JS requests PCM audio from OpenAI TTS, downsamples to 8 kHz, encodes to ADPCM, and sends chunks through AppMessage.
