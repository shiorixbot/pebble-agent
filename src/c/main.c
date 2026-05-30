#include <pebble.h>

#define RING_BUFFER_SIZE 16384
#define MAX_TEXT_LENGTH 2048
#define PLAYBACK_ADPCM_BYTES 800
#define PLAYBACK_PCM_SAMPLES (PLAYBACK_ADPCM_BYTES * 2)
#define PLAYBACK_INTERVAL_MS 200
#define START_BUFFER_THRESHOLD 2400
#define STREAM_CLOSE_DELAY_MS 1200

#define PERSIST_KEY_FONT_SIZE 1

typedef enum {
  UI_IDLE,
  UI_THINKING,
  UI_RESULT
} UiState;

static Window *s_window;
static TextLayer *s_title_layer;
static TextLayer *s_hint_layer;
static TextLayer *s_status_layer;
static ScrollLayer *s_scroll_layer;
static TextLayer *s_text_layer;
static DictationSession *s_dictation;
static AppTimer *s_thinking_timer;
static AppTimer *s_playback_timer;
static AppTimer *s_close_timer;
static char s_text[MAX_TEXT_LENGTH];
static int s_thinking_dots;
static bool s_speaker_open;

static uint8_t s_ring[RING_BUFFER_SIZE];
static uint32_t s_head;
static uint32_t s_tail;
static uint32_t s_count;

static int32_t s_adpcm_valpred;
static int32_t s_adpcm_index;

static const int16_t s_step_table[89] = {
  7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,
  34,37,41,45,50,55,60,66,73,80,88,97,107,118,
  130,143,157,173,190,209,230,253,279,307,337,
  371,408,449,494,544,598,658,724,796,876,963,
  1060,1166,1282,1411,1552,1707,1878,2066,2272,
  2499,2749,3024,3327,3660,4026,4428,4871,5358,
  5894,6484,7132,7845,8630,9493,10442,11487,
  12635,13899,15289,16818,18500,20350,22385,
  24623,27086,29794,32767
};

static const int8_t s_index_table[16] = {
  -1,-1,-1,-1,2,4,6,8,
  -1,-1,-1,-1,2,4,6,8
};

static void reset_audio_state(void) {
  s_head = 0;
  s_tail = 0;
  s_count = 0;
  s_adpcm_valpred = 0;
  s_adpcm_index = 0;
}

static int8_t decode_adpcm_nibble(uint8_t delta) {
  int32_t step = s_step_table[s_adpcm_index];
  int32_t vpdiff = step >> 3;

  if (delta & 4) vpdiff += step;
  if (delta & 2) vpdiff += step >> 1;
  if (delta & 1) vpdiff += step >> 2;

  if (delta & 8) s_adpcm_valpred -= vpdiff;
  else s_adpcm_valpred += vpdiff;

  if (s_adpcm_valpred > 32767) s_adpcm_valpred = 32767;
  if (s_adpcm_valpred < -32768) s_adpcm_valpred = -32768;

  s_adpcm_index += s_index_table[delta & 0x0F];
  if (s_adpcm_index < 0) s_adpcm_index = 0;
  if (s_adpcm_index > 88) s_adpcm_index = 88;

  return (int8_t)(s_adpcm_valpred >> 8);
}

static void update_text_layout(void) {
  GRect bounds = layer_get_bounds(window_get_root_layer(s_window));
  int16_t width = bounds.size.w - 10;
  text_layer_set_size(s_text_layer, GSize(width, 2000));
  GSize content = text_layer_get_content_size(s_text_layer);
  content.h += 12;
  text_layer_set_size(s_text_layer, content);
  scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, content.h + 20));
}

static void set_font_size(int size) {
  if (size <= 14) text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14));
  else if (size <= 18) text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  else if (size <= 24) text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24));
  else text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28));
  persist_write_int(PERSIST_KEY_FONT_SIZE, size);
  update_text_layout();
}

static void thinking_timer_callback(void *context) {
  static char buf[24];
  s_thinking_dots = (s_thinking_dots + 1) % 4;
  snprintf(buf, sizeof(buf), "Translating%.*s", s_thinking_dots, "...");
  text_layer_set_text(s_hint_layer, buf);
  s_thinking_timer = app_timer_register(400, thinking_timer_callback, NULL);
}

static void set_ui(UiState state) {
  if (s_thinking_timer) {
    app_timer_cancel(s_thinking_timer);
    s_thinking_timer = NULL;
  }

  bool show_result = state == UI_RESULT;
  layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), !show_result);
  layer_set_hidden(text_layer_get_layer(s_title_layer), show_result);
  layer_set_hidden(text_layer_get_layer(s_hint_layer), show_result);
  layer_set_hidden(text_layer_get_layer(s_status_layer), !show_result);

  if (state == UI_IDLE) {
    text_layer_set_text(s_hint_layer, "Press Select\nto translate");
    text_layer_set_text(s_status_layer, "");
  } else if (state == UI_THINKING) {
    s_thinking_dots = 0;
    thinking_timer_callback(NULL);
  } else {
    text_layer_set_text(s_status_layer, "Select: stop / back");
  }
}

static void cancel_close_timer(void) {
  if (s_close_timer) {
    app_timer_cancel(s_close_timer);
    s_close_timer = NULL;
  }
}

static void close_timer_callback(void *context) {
  s_close_timer = NULL;
  if (s_speaker_open && s_count == 0) {
    speaker_stream_close();
    s_speaker_open = false;
  }
}

static void schedule_close_timer(void) {
  cancel_close_timer();
  s_close_timer = app_timer_register(STREAM_CLOSE_DELAY_MS, close_timer_callback, NULL);
}

static void playback_timer_callback(void *context) {
  s_playback_timer = NULL;
  if (!s_speaker_open) return;

  static int8_t out[PLAYBACK_PCM_SAMPLES];

  if (s_count >= PLAYBACK_ADPCM_BYTES) {
    for (int i = 0; i < PLAYBACK_ADPCM_BYTES; i++) {
      uint8_t b = s_ring[s_head];
      s_head = (s_head + 1) % RING_BUFFER_SIZE;
      s_count--;
      out[i * 2] = decode_adpcm_nibble((b >> 4) & 0x0F);
      out[i * 2 + 1] = decode_adpcm_nibble(b & 0x0F);
    }
    speaker_stream_write((uint8_t *)out, sizeof(out));
    s_playback_timer = app_timer_register(PLAYBACK_INTERVAL_MS, playback_timer_callback, NULL);
  } else if (s_count > 0) {
    s_playback_timer = app_timer_register(100, playback_timer_callback, NULL);
    schedule_close_timer();
  } else {
    schedule_close_timer();
  }
}

static void start_playback(void) {
  cancel_close_timer();
  if (!s_speaker_open) {
    if (!speaker_stream_open(SpeakerPcmFormat_8kHz_8bit, 100)) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "speaker_stream_open failed");
      return;
    }
    s_speaker_open = true;
  }
  if (!s_playback_timer) {
    s_playback_timer = app_timer_register(PLAYBACK_INTERVAL_MS, playback_timer_callback, NULL);
  }
}

static void push_audio_chunk(const uint8_t *data, uint16_t length) {
  for (uint16_t i = 0; i < length; i++) {
    if (s_count < RING_BUFFER_SIZE) {
      s_ring[s_tail] = data[i];
      s_tail = (s_tail + 1) % RING_BUFFER_SIZE;
      s_count++;
    }
  }
  cancel_close_timer();
  if (!s_speaker_open && s_count >= START_BUFFER_THRESHOLD) start_playback();
}

static void stop_audio_and_reset(void) {
  if (s_playback_timer) {
    app_timer_cancel(s_playback_timer);
    s_playback_timer = NULL;
  }
  cancel_close_timer();
  if (s_speaker_open) {
    speaker_stream_close();
    s_speaker_open = false;
  }
  reset_audio_state();
  set_ui(UI_IDLE);
}

static void inbox_received_callback(DictionaryIterator *iter, void *context) {
  Tuple *command = dict_find(iter, MESSAGE_KEY_COMMAND);
  if (!command) return;

  if (strcmp(command->value->cstring, "TEXT_RESPONSE") == 0) {
    Tuple *text = dict_find(iter, MESSAGE_KEY_TEXT);
    if (!text) return;
    snprintf(s_text, sizeof(s_text), "%s", text->value->cstring);
    text_layer_set_text(s_text_layer, s_text);
    update_text_layout();
    reset_audio_state();
    set_ui(UI_RESULT);
  } else if (strcmp(command->value->cstring, "AUDIO_CHUNK") == 0) {
    Tuple *chunk = dict_find(iter, MESSAGE_KEY_CHUNK);
    if (chunk) push_audio_chunk(chunk->value->data, chunk->length);
  } else if (strcmp(command->value->cstring, "AUDIO_END") == 0) {
    if (!s_speaker_open && s_count > 0) start_playback();
    schedule_close_timer();
  } else if (strcmp(command->value->cstring, "UPDATE_FONT") == 0) {
    Tuple *font = dict_find(iter, MESSAGE_KEY_FONT_SIZE);
    if (font) set_font_size(font->value->int32);
  }
}

static void inbox_dropped_callback(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "Inbox dropped: %d", reason);
}

static void outbox_failed_callback(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "Outbox failed: %d", reason);
  set_ui(UI_IDLE);
}

static void dictation_callback(DictationSession *session, DictationSessionStatus status, char *transcription, void *context) {
  if (status == DictationSessionStatusSuccess) {
    set_ui(UI_THINKING);
    DictionaryIterator *iter;
    if (app_message_outbox_begin(&iter) == APP_MSG_OK) {
      dict_write_cstring(iter, MESSAGE_KEY_COMMAND, "DICTATION");
      dict_write_cstring(iter, MESSAGE_KEY_TEXT, transcription);
      app_message_outbox_send();
    }
  } else {
    set_ui(UI_IDLE);
  }
}

static void select_click_handler(ClickRecognizerRef recognizer, void *context) {
  if (s_speaker_open || s_count > 0 || !layer_get_hidden(scroll_layer_get_layer(s_scroll_layer))) {
    stop_audio_and_reset();
    vibes_short_pulse();
  } else {
    dictation_session_start(s_dictation);
  }
}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_title_layer = text_layer_create(GRect(8, 34, bounds.size.w - 16, 34));
  text_layer_set_text(s_title_layer, "Pebble Agent");
  text_layer_set_text_alignment(s_title_layer, GTextAlignmentCenter);
  text_layer_set_font(s_title_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  layer_add_child(root, text_layer_get_layer(s_title_layer));

  s_hint_layer = text_layer_create(GRect(8, 78, bounds.size.w - 16, 54));
  text_layer_set_text_alignment(s_hint_layer, GTextAlignmentCenter);
  text_layer_set_font(s_hint_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  layer_add_child(root, text_layer_get_layer(s_hint_layer));

  s_status_layer = text_layer_create(GRect(0, bounds.size.h - 20, bounds.size.w, 20));
  text_layer_set_text_alignment(s_status_layer, GTextAlignmentCenter);
  text_layer_set_font(s_status_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14));
  layer_add_child(root, text_layer_get_layer(s_status_layer));

  s_scroll_layer = scroll_layer_create(GRect(0, 0, bounds.size.w, bounds.size.h - 20));
  scroll_layer_set_click_config_onto_window(s_scroll_layer, window);
  layer_add_child(root, scroll_layer_get_layer(s_scroll_layer));

  s_text_layer = text_layer_create(GRect(5, 5, bounds.size.w - 10, 2000));
  text_layer_set_text(s_text_layer, "");
  text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24));
  scroll_layer_add_child(s_scroll_layer, text_layer_get_layer(s_text_layer));

  if (persist_exists(PERSIST_KEY_FONT_SIZE)) set_font_size(persist_read_int(PERSIST_KEY_FONT_SIZE));
  set_ui(UI_IDLE);
}

static void window_unload(Window *window) {
  text_layer_destroy(s_title_layer);
  text_layer_destroy(s_hint_layer);
  text_layer_destroy(s_status_layer);
  text_layer_destroy(s_text_layer);
  scroll_layer_destroy(s_scroll_layer);
}

static void init(void) {
  reset_audio_state();

  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);
  app_message_open(8192, 2048);

  s_dictation = dictation_session_create(MAX_TEXT_LENGTH, dictation_callback, NULL);

  s_window = window_create();
  window_set_click_config_provider(s_window, click_config_provider);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload
  });
  window_stack_push(s_window, true);
}

static void deinit(void) {
  stop_audio_and_reset();
  if (s_dictation) dictation_session_destroy(s_dictation);
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
