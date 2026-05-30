var Clay = require('pebble-clay');

var clayConfig = [
  { type: 'heading', defaultValue: 'OpenClaw Wrist' },
  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Mode' },
      {
        type: 'select',
        messageKey: 'APP_MODE',
        label: 'Select action',
        defaultValue: 'translate',
        options: [
          { label: 'Translate phrase', value: 'translate' },
          { label: 'Ask OpenClaw', value: 'openclaw' }
        ]
      },
      { type: 'heading', defaultValue: 'OpenAI' },
      {
        type: 'input',
        messageKey: 'OPENAI_API_KEY',
        label: 'OpenAI API Key',
        attributes: { type: 'password', autocorrect: 'off', autocapitalize: 'off' }
      },
      {
        type: 'input',
        messageKey: 'MODEL',
        label: 'Translation model',
        defaultValue: 'gpt-4.1-mini',
        attributes: { type: 'text', autocorrect: 'off', autocapitalize: 'off' }
      },
      {
        type: 'input',
        messageKey: 'TARGET_LANGUAGE',
        label: 'Target language',
        defaultValue: 'Japanese',
        attributes: { type: 'text' }
      },
      {
        type: 'select',
        messageKey: 'VOICE',
        label: 'Voice',
        defaultValue: 'alloy',
        options: [
          { label: 'Alloy', value: 'alloy' },
          { label: 'Ash', value: 'ash' },
          { label: 'Ballad', value: 'ballad' },
          { label: 'Coral', value: 'coral' },
          { label: 'Echo', value: 'echo' },
          { label: 'Sage', value: 'sage' },
          { label: 'Shimmer', value: 'shimmer' },
          { label: 'Verse', value: 'verse' }
        ]
      }
    ]
  },
  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'OpenClaw' },
      {
        type: 'input',
        messageKey: 'OPENCLAW_URL',
        label: 'Gateway URL',
        description: 'Example: https://your-gateway.example.com',
        attributes: { type: 'url', autocorrect: 'off', autocapitalize: 'off' }
      },
      {
        type: 'input',
        messageKey: 'OPENCLAW_TOKEN',
        label: 'Gateway token/password',
        attributes: { type: 'password', autocorrect: 'off', autocapitalize: 'off' }
      },
      {
        type: 'input',
        messageKey: 'OPENCLAW_AGENT',
        label: 'Agent id',
        defaultValue: 'default',
        attributes: { type: 'text', autocorrect: 'off', autocapitalize: 'off' }
      },
      {
        type: 'input',
        messageKey: 'OPENCLAW_SESSION',
        label: 'Session key',
        defaultValue: 'pebble',
        attributes: { type: 'text', autocorrect: 'off', autocapitalize: 'off' }
      }
    ]
  },
  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Behavior' },
      {
        type: 'input',
        messageKey: 'CUSTOM_INSTRUCTIONS',
        label: 'Custom translation instructions',
        description: 'Example: keep names unchanged; use casual Japanese.',
        attributes: { spellcheck: 'true' }
      },
      {
        type: 'slider',
        messageKey: 'FONT_SIZE',
        defaultValue: 24,
        label: 'Font size',
        min: 14,
        max: 28,
        step: 2
      }
    ]
  },
  { type: 'submit', defaultValue: 'Save Settings' }
];

var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

var appMode = localStorage.getItem('APP_MODE') || 'translate';
var openaiApiKey = localStorage.getItem('OPENAI_API_KEY') || '';
var openclawUrl = localStorage.getItem('OPENCLAW_URL') || '';
var openclawToken = localStorage.getItem('OPENCLAW_TOKEN') || '';
var openclawAgent = localStorage.getItem('OPENCLAW_AGENT') || 'default';
var openclawSession = localStorage.getItem('OPENCLAW_SESSION') || 'pebble';
var targetLanguage = localStorage.getItem('TARGET_LANGUAGE') || 'Japanese';
var voice = localStorage.getItem('VOICE') || 'alloy';
var model = localStorage.getItem('MODEL') || 'gpt-4.1-mini';
var fontSize = localStorage.getItem('FONT_SIZE') || 24;
var customInstructions = localStorage.getItem('CUSTOM_INSTRUCTIONS') || '';

var readyAudioQueue = [];
var isSendingBLE = false;
var jsAdpcmValpred = 0;
var jsAdpcmIndex = 0;

var stepTable = [
  7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,
  34,37,41,45,50,55,60,66,73,80,88,97,107,118,
  130,143,157,173,190,209,230,253,279,307,337,
  371,408,449,494,544,598,658,724,796,876,963,
  1060,1166,1282,1411,1552,1707,1878,2066,2272,
  2499,2749,3024,3327,3660,4026,4428,4871,5358,
  5894,6484,7132,7845,8630,9493,10442,11487,
  12635,13899,15289,16818,18500,20350,22385,
  24623,27086,29794,32767
];

var indexTable = [-1,-1,-1,-1,2,4,6,8,-1,-1,-1,-1,2,4,6,8];

Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;
  var settings = JSON.parse(decodeURIComponent(e.response));
  saveSetting(settings, 'APP_MODE', function(v) { appMode = v || 'translate'; });
  saveSetting(settings, 'OPENAI_API_KEY', function(v) { openaiApiKey = v; });
  saveSetting(settings, 'OPENCLAW_URL', function(v) { openclawUrl = v || ''; });
  saveSetting(settings, 'OPENCLAW_TOKEN', function(v) { openclawToken = v || ''; });
  saveSetting(settings, 'OPENCLAW_AGENT', function(v) { openclawAgent = v || 'default'; });
  saveSetting(settings, 'OPENCLAW_SESSION', function(v) { openclawSession = v || 'pebble'; });
  saveSetting(settings, 'TARGET_LANGUAGE', function(v) { targetLanguage = v || 'Japanese'; });
  saveSetting(settings, 'VOICE', function(v) { voice = v || 'alloy'; });
  saveSetting(settings, 'MODEL', function(v) { model = v || 'gpt-4.1-mini'; });
  saveSetting(settings, 'CUSTOM_INSTRUCTIONS', function(v) { customInstructions = v || ''; });
  saveSetting(settings, 'FONT_SIZE', function(v) {
    fontSize = v || 24;
    Pebble.sendAppMessage({ COMMAND: 'UPDATE_FONT', FONT_SIZE: parseInt(fontSize, 10) });
  });
});

Pebble.addEventListener('ready', function() {
  if (fontSize != 24) {
    Pebble.sendAppMessage({ COMMAND: 'UPDATE_FONT', FONT_SIZE: parseInt(fontSize, 10) });
  }
});

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload || {};
  if (dict.COMMAND === 'DICTATION') {
    refreshSettings();
    if (appMode === 'openclaw') {
      askOpenClawAndMaybeSpeak(dict.TEXT || '');
    } else {
      if (!openaiApiKey) {
        sendText('Missing OpenAI API key. Open settings in the Pebble app.');
        return;
      }
      translateAndSpeak(dict.TEXT || '');
    }
  }
});

function saveSetting(settings, key, setter) {
  if (settings[key]) {
    var value = settings[key].value;
    localStorage.setItem(key, value);
    setter(value);
  }
}

function refreshSettings() {
  appMode = localStorage.getItem('APP_MODE') || appMode || 'translate';
  openaiApiKey = localStorage.getItem('OPENAI_API_KEY') || openaiApiKey;
  openclawUrl = localStorage.getItem('OPENCLAW_URL') || openclawUrl;
  openclawToken = localStorage.getItem('OPENCLAW_TOKEN') || openclawToken;
  openclawAgent = localStorage.getItem('OPENCLAW_AGENT') || openclawAgent || 'default';
  openclawSession = localStorage.getItem('OPENCLAW_SESSION') || openclawSession || 'pebble';
  targetLanguage = localStorage.getItem('TARGET_LANGUAGE') || targetLanguage || 'Japanese';
  voice = localStorage.getItem('VOICE') || voice || 'alloy';
  model = localStorage.getItem('MODEL') || model || 'gpt-4.1-mini';
  customInstructions = localStorage.getItem('CUSTOM_INSTRUCTIONS') || customInstructions || '';
}

function sendText(text) {
  Pebble.sendAppMessage({ COMMAND: 'TEXT_RESPONSE', TEXT: String(text).substring(0, 2048) });
}


function askOpenClawAndMaybeSpeak(prompt) {
  readyAudioQueue = [];
  isSendingBLE = false;
  jsAdpcmValpred = 0;
  jsAdpcmIndex = 0;

  if (!openclawUrl) {
    sendText('Missing OpenClaw Gateway URL. Open settings in the Pebble app.');
    return;
  }

  askOpenClaw(prompt)
    .then(function(replyText) {
      sendText(replyText);
      if (!openaiApiKey) return null;
      return fetchSpeechPcm(replyText);
    })
    .then(function(pcm24k) {
      if (!pcm24k) return;
      var pcm8k = downsamplePcm(pcm24k, 3);
      var adpcmBytes = encodeADPCM(lowPassFilter(pcm8k));
      readyAudioQueue.push(adpcmBytes);
      startBLESendLoop();
    })
    .catch(function(err) {
      console.log('OpenClaw error', err && err.message ? err.message : err);
      sendText('OpenClaw error: ' + String(err && err.message ? err.message : err).substring(0, 80));
    });
}

function askOpenClaw(prompt) {
  var baseUrl = openclawUrl.replace(/\/+$/, '');
  var headers = { 'Content-Type': 'application/json' };
  if (openclawToken) headers.Authorization = 'Bearer ' + openclawToken;
  if (openclawAgent && openclawAgent !== 'default') headers['x-openclaw-agent-id'] = openclawAgent;
  if (openclawSession) headers['x-openclaw-session-key'] = openclawSession;
  headers['x-openclaw-message-channel'] = 'pebble';

  return fetch(baseUrl + '/v1/responses', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: openclawAgent && openclawAgent !== 'default' ? 'openclaw/' + openclawAgent : 'openclaw/default',
      input: prompt,
      user: openclawSession || 'pebble',
      max_output_tokens: 700
    })
  })
  .then(function(response) {
    return response.json().then(function(json) {
      if (!response.ok) throw new Error((json.error && json.error.message) || response.statusText);
      return json;
    });
  })
  .then(extractResponseText);
}

function extractResponseText(json) {
  if (json.output_text) return json.output_text.trim();
  if (json.output && json.output.length) {
    var chunks = [];
    for (var i = 0; i < json.output.length; i++) {
      var content = json.output[i].content || [];
      for (var j = 0; j < content.length; j++) {
        if (content[j].text) chunks.push(content[j].text);
      }
    }
    if (chunks.length) return chunks.join('\n').trim();
  }
  throw new Error('empty OpenClaw response');
}

function translateAndSpeak(sourceText) {
  readyAudioQueue = [];
  isSendingBLE = false;
  jsAdpcmValpred = 0;
  jsAdpcmIndex = 0;

  translateText(sourceText)
    .then(function(translatedText) {
      sendText(translatedText);
      return fetchSpeechPcm(translatedText);
    })
    .then(function(pcm24k) {
      var pcm8k = downsamplePcm(pcm24k, 3);
      var adpcmBytes = encodeADPCM(lowPassFilter(pcm8k));
      readyAudioQueue.push(adpcmBytes);
      startBLESendLoop();
    })
    .catch(function(err) {
      console.log('OpenAI Translate error', err && err.message ? err.message : err);
      sendText('OpenAI error: ' + String(err && err.message ? err.message : err).substring(0, 80));
    });
}

function translateText(sourceText) {
  var instructions = 'Translate the user text into ' + targetLanguage + '. Return only the translation. Preserve names, numbers, URLs, and code. No markdown.';
  if (customInstructions) instructions += ' Extra instructions: ' + customInstructions;

  return fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + openaiApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      instructions: instructions,
      input: sourceText
    })
  })
  .then(function(response) {
    return response.json().then(function(json) {
      if (!response.ok) throw new Error((json.error && json.error.message) || response.statusText);
      return json;
    });
  })
  .then(function(json) {
    if (json.output_text) return json.output_text.trim();
    if (json.output && json.output.length) {
      for (var i = 0; i < json.output.length; i++) {
        var content = json.output[i].content || [];
        for (var j = 0; j < content.length; j++) {
          if (content[j].text) return content[j].text.trim();
        }
      }
    }
    throw new Error('empty translation');
  });
}

function fetchSpeechPcm(text) {
  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + openaiApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: voice,
      input: text,
      response_format: 'pcm'
    })
  })
  .then(function(response) {
    if (!response.ok) {
      return response.text().then(function(body) { throw new Error(body || response.statusText); });
    }
    return response.arrayBuffer();
  })
  .then(function(buffer) {
    var view = new DataView(buffer);
    var pcm = [];
    for (var i = 0; i + 1 < view.byteLength; i += 2) {
      pcm.push(view.getInt16(i, true));
    }
    return pcm;
  });
}

function downsamplePcm(samples, factor) {
  if (factor <= 1) return samples;
  var out = [];
  for (var i = 0; i < samples.length; i += factor) {
    var sum = 0;
    var count = 0;
    for (var j = 0; j < factor && i + j < samples.length; j++) {
      sum += samples[i + j];
      count++;
    }
    out.push(sum / count);
  }
  return out;
}

function lowPassFilter(samples) {
  if (samples.length < 3) return samples;
  var filtered = [samples[0], samples[1]];
  for (var i = 2; i < samples.length; i++) {
    filtered[i] = (samples[i] + samples[i - 1] + samples[i - 2]) / 3;
  }
  return filtered;
}

function encodeADPCM(pcm16) {
  var adpcm = [];
  var buffer = 0;
  var highNibble = true;

  for (var i = 0; i < pcm16.length; i++) {
    var sample = Math.max(-32768, Math.min(32767, pcm16[i] | 0));
    var diff = sample - jsAdpcmValpred;
    var sign = diff < 0 ? 8 : 0;
    if (sign) diff = -diff;

    var step = stepTable[jsAdpcmIndex];
    var delta = 0;
    var vpdiff = step >> 3;

    if (diff >= step) { delta |= 4; diff -= step; vpdiff += step; }
    step >>= 1;
    if (diff >= step) { delta |= 2; diff -= step; vpdiff += step; }
    step >>= 1;
    if (diff >= step) { delta |= 1; vpdiff += step; }

    jsAdpcmValpred += sign ? -vpdiff : vpdiff;
    if (jsAdpcmValpred > 32767) jsAdpcmValpred = 32767;
    if (jsAdpcmValpred < -32768) jsAdpcmValpred = -32768;

    delta |= sign;
    jsAdpcmIndex += indexTable[delta];
    if (jsAdpcmIndex < 0) jsAdpcmIndex = 0;
    if (jsAdpcmIndex > 88) jsAdpcmIndex = 88;

    if (highNibble) {
      buffer = (delta & 0x0F) << 4;
      highNibble = false;
    } else {
      buffer |= (delta & 0x0F);
      adpcm.push(buffer);
      highNibble = true;
    }
  }

  if (!highNibble) adpcm.push(buffer);
  return adpcm;
}

function startBLESendLoop() {
  if (isSendingBLE || readyAudioQueue.length === 0) return;
  isSendingBLE = true;

  var adpcmBytes = readyAudioQueue.shift();
  var cursor = 0;

  function sendNextChunk() {
    var previousCursor = cursor;
    var chunk = [];
    var chunkSize = 700;

    while (chunk.length < chunkSize && cursor < adpcmBytes.length) {
      chunk.push(adpcmBytes[cursor++]);
    }

    if (chunk.length > 0) {
      Pebble.sendAppMessage(
        { COMMAND: 'AUDIO_CHUNK', CHUNK: chunk },
        function() { setTimeout(sendNextChunk, 60); },
        function() { cursor = previousCursor; setTimeout(sendNextChunk, 200); }
      );
    } else {
      Pebble.sendAppMessage(
        { COMMAND: 'AUDIO_END' },
        function() { isSendingBLE = false; setTimeout(startBLESendLoop, 120); },
        function() { isSendingBLE = false; setTimeout(startBLESendLoop, 300); }
      );
    }
  }

  sendNextChunk();
}
