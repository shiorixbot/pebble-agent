# Pebble OpenAI Translate

A Pebble voice translation watchapp powered by OpenAI.

MVP flow:

1. Press Select on the watch.
2. Pebble Dictation converts speech to source text.
3. The phone-side PebbleKit JS calls OpenAI to translate that text.
4. The translated text is shown on the watch.
5. OpenAI TTS generates speech, which is streamed back to the watch as ADPCM chunks.

This is intentionally **not** a fork of `ericlmccormick/Pebble_Gemini`, because that repository currently has no license. It uses the same product idea — a Pebble voice assistant/translator — but this codebase is a clean MIT-licensed implementation.

## Current status

Prototype scaffold. The first target is a phrase-translation MVP, not continuous realtime audio.

OpenAI Realtime translation needs a streamed microphone audio source. Pebble's public Dictation API returns final text, not raw live audio, so true realtime translation likely needs a phone-side companion/WebRTC path later.

## Configuration

Open the Pebble configuration page and set:

- OpenAI API key
- Target language, e.g. `Japanese`, `English`, `Chinese`, `Spanish`
- TTS voice
- Optional custom translation instructions

## Build

Requires a Pebble/Rebble SDK environment.

```bash
npm install
pebble build
```

## Notes

The watch receives 8 kHz audio chunks encoded as IMA ADPCM to keep BLE transfers small. The phone-side JS requests PCM audio from OpenAI TTS, downsamples to 8 kHz, encodes to ADPCM, and sends chunks through AppMessage.
