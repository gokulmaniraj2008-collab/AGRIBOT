/*
  ESP32-CAM -> Supabase plant classification
  Board: AI Thinker ESP32-CAM

  What it does:
  - Connects to WiFi
  - Heartbeats its own presence into robot_status under CAM_ROBOT_ID
    ("agribot-01-cam") — a SEPARATE identity from the main board's
    "agribot-01" row, on purpose (see identity note below)
  - Polls robot_commands for a "camera_check" command (written by the
    main agribot_main.ino board over Supabase — the two boards have no
    direct wired link, this is the only channel between them)
  - On request: captures a JPEG, calls Gemini directly for a plant/
    not-plant classification, writes the result to robot_images so the
    main board (polling the same table) can pick it up
  - Also still uploads a periodic snapshot to Supabase Storage for the
    website gallery, same as before

  DB migration status (applied 2026-08-16 to this project):
    1. "camera_check" added to the robot_commands.command CHECK
       constraint — requests from the main board no longer get
       rejected. Re-check this if you're pointing at a different
       Supabase project.
    2. public.is_camera_online(p_robot_id, p_max_age_seconds) RPC added
       — lets the main board treat a STALE heartbeat as offline without
       needing its own RTC/NTP time. This board doesn't call it (it only
       writes the heartbeat); agribot_main.ino's isCameraOnline() calls
       it to read the result.

  IDENTITY NOTE — read before changing CAM_ROBOT_ID or DEVICE_ID:
  robot_status.robot_id is that table's PRIMARY KEY, and the main board
  upserts its own row there under "agribot-01" (motor/pump/mode state).
  This board's heartbeat MUST upsert under a different id
  (CAM_ROBOT_ID = "agribot-01-cam") — reusing DEVICE_ID would upsert
  into the SAME row as the main board and silently overwrite its
  motor/pump/mode fields with camera defaults on every camera
  heartbeat. DEVICE_ID stays "agribot-01" everywhere else in this file
  (robot_commands polling, robot_images.robot_id) because those are
  correctly meant to identify the camera's answers as belonging to the
  main robot "agribot-01"'s patrol, not the camera itself.

  SECURITY WARNING: GEMINI_API_KEY below is embedded in plaintext in
  this firmware. If this .ino is ever committed to a public GitHub repo
  (your other AGRIBOT files already are), that key is exposed to
  anyone who reads the repo. Consider routing this through a backend
  proxy endpoint instead of calling Gemini directly from the device —
  see the note in agribot_main.ino's CAMERA_CHECK_ENABLED comment.

  Wiring reminder: GPIO0 -> GND only during flashing. Disconnect + reset before running.
*/

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---------- CONFIG: EDIT THESE ----------
const char* WIFI_SSID     = "AGRIBOT_WIFI";
const char* WIFI_PASSWORD = "12345678";

const char* SUPABASE_URL      = "https://hvnasippwadzygnaodpp.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bmFzaXBwd2FkenlnbmFvZHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjg3NDMsImV4cCI6MjA5MTUwNDc0M30.dcS0J77idvjkwNesRJS7C-LfmhSDlILASMK65AesRaM";
const char* BUCKET_NAME       = "robot-images";
const char* DEVICE_ID         = "agribot-01";     // identity used when polling
                                                   // robot_commands and when
                                                   // labeling robot_images rows
                                                   // as belonging to the main
                                                   // robot's patrol — NOT this
                                                   // board's own heartbeat id.
const char* CAM_ROBOT_ID      = "agribot-01-cam"; // THIS board's own identity
                                                   // in robot_status — must stay
                                                   // different from DEVICE_ID.
                                                   // Must match CAM_ROBOT_ID in
                                                   // agribot_main.ino exactly.
const char* GEMINI_API_KEY    = "PASTE_YOUR_GEMINI_KEY_HERE"; // see SECURITY WARNING above

const unsigned long UPLOAD_INTERVAL_MS    = 5000;  // periodic snapshot cadence
const unsigned long COMMAND_POLL_MS       = 2000;  // how often to check for camera_check requests
const unsigned long HEARTBEAT_INTERVAL_MS = 5000;  // how often to refresh the
                                                    // "I'm online" heartbeat —
                                                    // matches the main board's
                                                    // own STATUS_INTERVAL_MS so
                                                    // both heartbeats age at a
                                                    // similar rate. Keep this in
                                                    // sync with the max-age
                                                    // window agribot_main.ino
                                                    // passes to is_camera_online()
                                                    // — that window should be a
                                                    // few multiples of this, not
                                                    // equal to it, so ordinary
                                                    // network jitter doesn't
                                                    // flap the camera on/off.
// -----------------------------------------

// AI Thinker ESP32-CAM pin map
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

unsigned long lastUpload = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;

const char* CLASSIFY_PROMPT =
  "You are looking at a photo from a farm robot's camera, taken when its "
  "distance sensor detected something close by. Respond with ONLY one "
  "word: PLANT if the image shows a live plant/crop, or NOT_PLANT if it "
  "shows anything else (rock, stake, person, empty ground, blur, etc).";

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_SVGA; // 800x600, good balance for upload size
    config.jpeg_quality = 12;           // lower number = higher quality/larger file
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }
  return true;
}

void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connect failed, will retry in loop.");
  }
}

// Upserts THIS board's own presence into robot_status under CAM_ROBOT_ID
// ("agribot-01-cam") — deliberately a different primary key than the
// main board's "agribot-01" row, so this can never overwrite the main
// robot's motor/pump/mode state. Columns not sent here (mode,
// motor_state, speed_value, etc.) all have DB-side defaults, so the
// insert still succeeds cleanly the first time this row is created.
// agribot_main.ino's isCameraOnline() reads this via the
// is_camera_online() RPC, which also checks updated_at freshness
// server-side — this function's only job is to keep updated_at
// current by upserting on a steady cadence; it doesn't need to know or
// send any timestamp itself (the DB trigger sets updated_at = now()
// on every UPDATE this upsert causes).
void pushCamStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<192> doc;
  doc["robot_id"] = CAM_ROBOT_ID;
  doc["name"] = "AgriBot Camera";
  doc["online"] = true;
  String payload; serializeJson(doc, payload);

  String url = String(SUPABASE_URL) + "/rest/v1/robot_status?on_conflict=robot_id";
  HTTPClient http;
  if (!http.begin(url)) return;
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "resolution=merge-duplicates,return=minimal");
  int code = http.POST(payload);
  if (code < 200 || code >= 300) {
    Serial.printf("Camera heartbeat failed: HTTP %d\n", code);
  }
  http.end();
}

bool uploadFrame(camera_fb_t* fb) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping upload.");
    return false;
  }

  // filename: deviceid_timestamp.jpg
  char filename[80];
  snprintf(filename, sizeof(filename), "%s_%lu.jpg", DEVICE_ID, millis());

  String url = String(SUPABASE_URL) + "/storage/v1/object/" + BUCKET_NAME + "/" + filename;

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("x-upsert", "true");

  int httpCode = http.POST(fb->buf, fb->len);

  bool ok = (httpCode == 200 || httpCode == 201);
  if (ok) {
    Serial.printf("Uploaded: %s (%d bytes) -> HTTP %d\n", filename, fb->len, httpCode);
  } else {
    Serial.printf("Upload failed. HTTP %d\n", httpCode);
    String resp = http.getString();
    Serial.println(resp);
  }

  http.end();
  return ok;
}

// Base64-encodes a JPEG frame buffer for Gemini's inline_data field.
// Simple lookup-table encoder — no external base64 library required.
String base64Encode(const uint8_t* data, size_t len) {
  static const char* chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String out;
  out.reserve((len + 2) / 3 * 4);
  size_t i = 0;
  while (i + 3 <= len) {
    uint32_t n = ((uint32_t)data[i] << 16) | ((uint32_t)data[i + 1] << 8) | data[i + 2];
    out += chars[(n >> 18) & 0x3F];
    out += chars[(n >> 12) & 0x3F];
    out += chars[(n >> 6) & 0x3F];
    out += chars[n & 0x3F];
    i += 3;
  }
  size_t rem = len - i;
  if (rem == 1) {
    uint32_t n = (uint32_t)data[i] << 16;
    out += chars[(n >> 18) & 0x3F];
    out += chars[(n >> 12) & 0x3F];
    out += "==";
  } else if (rem == 2) {
    uint32_t n = ((uint32_t)data[i] << 16) | ((uint32_t)data[i + 1] << 8);
    out += chars[(n >> 18) & 0x3F];
    out += chars[(n >> 12) & 0x3F];
    out += chars[(n >> 6) & 0x3F];
    out += "=";
  }
  return out;
}

// Calls Gemini directly with the JPEG and returns true for "plant",
// false for "not_plant" OR any failure (network, bad response, etc) —
// callers decide how to log an ambiguous/failed classification.
bool classifyWithGemini(camera_fb_t* fb, bool& outSucceeded) {
  outSucceeded = false;
  if (WiFi.status() != WL_CONNECTED) return false;

  String b64 = base64Encode(fb->buf, fb->len);

  DynamicJsonDocument reqDoc(b64.length() + 1024);
  JsonArray contents = reqDoc.createNestedArray("contents");
  JsonObject content = contents.createNestedObject();
  JsonArray parts = content.createNestedArray("parts");
  JsonObject imgPart = parts.createNestedObject();
  JsonObject inlineData = imgPart.createNestedObject("inline_data");
  inlineData["mime_type"] = "image/jpeg";
  inlineData["data"] = b64;
  JsonObject textPart = parts.createNestedObject();
  textPart["text"] = CLASSIFY_PROMPT;

  String payload;
  serializeJson(reqDoc, payload);

  String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
               String(GEMINI_API_KEY);

  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);

  bool isPlant = false;
  if (code == 200) {
    String resp = http.getString();
    DynamicJsonDocument respDoc(4096);
    if (!deserializeJson(respDoc, resp)) {
      String text = respDoc["candidates"][0]["content"]["parts"][0]["text"] | "";
      text.toUpperCase();
      if (text.indexOf("NOT_PLANT") >= 0) {
        isPlant = false;
        outSucceeded = true;
      } else if (text.indexOf("PLANT") >= 0) {
        isPlant = true;
        outSucceeded = true;
      }
    }
  } else {
    Serial.printf("Gemini request failed: HTTP %d\n", code);
  }
  http.end();
  return isPlant;
}

// Writes the classification result into robot_images so the main board
// (polling the same table by robot_id + plant_id) can pick it up.
// disease_status is reused to carry "plant"/"not_plant" — see the
// comment in agribot_main.ino's requestCameraCheck() for why.
//
// storage_path MUST be unique per row — robot_images.storage_path has a
// UNIQUE NOT NULL constraint in the DB. The original version of this
// function always sent "", which let the FIRST classification ever
// insert successfully and made EVERY classification after that fail
// silently (unique-constraint violation, only logged to Serial, never
// surfaced to the main board) — confirmed by reproducing the failure
// directly against the live table. Build a genuinely unique string per
// capture instead, the same way uploadFrame() already does for its own
// periodic snapshots, just under this board's own id so the two
// filename streams can't collide with each other either.
void reportClassification(int plantIndex, bool isPlant) {
  char pathBuf[64];
  snprintf(pathBuf, sizeof(pathBuf), "%s_%lu.jpg", CAM_ROBOT_ID, millis());

  StaticJsonDocument<256> doc;
  doc["robot_id"] = DEVICE_ID;
  doc["storage_path"] = pathBuf;
  doc["plant_id"] = String(plantIndex);
  doc["disease_status"] = isPlant ? "plant" : "not_plant";
  String payload; serializeJson(doc, payload);

  String url = String(SUPABASE_URL) + "/rest/v1/robot_images";
  HTTPClient http;
  if (!http.begin(url)) return;
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  if (code < 200 || code >= 300) {
    Serial.printf("Failed to report classification: HTTP %d\n", code);
  }
  http.end();
}

// Polls robot_commands for an unexecuted "camera_check" command, and if
// found, captures + classifies + reports + marks it executed. Mirrors
// the polling pattern agribot_main.ino already uses for its own
// commands, so both boards behave consistently.
void pollForCameraCheckCommand() {
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?robot_id=eq." + DEVICE_ID +
               "&command=eq.camera_check&executed=eq.false&order=created_at.asc&limit=1";
  HTTPClient http;
  if (!http.begin(url)) return;
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  int code = http.GET();
  if (code != 200) { http.end(); return; }

  String resp = http.getString();
  http.end();
  DynamicJsonDocument doc(512);
  if (deserializeJson(doc, resp)) return;
  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() == 0) return;

  long cmdId = arr[0]["id"] | 0;
  int plantIndex = arr[0]["value"] | 0;

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed for camera_check.");
    return;
  }
  bool succeeded = false;
  bool isPlant = classifyWithGemini(fb, succeeded);
  esp_camera_fb_return(fb);

  // If Gemini failed outright, default to "plant" (fail open) rather
  // than blocking the main board's patrol on a bad photo/network blip.
  reportClassification(plantIndex, succeeded ? isPlant : true);

  // Mark the command executed so it isn't picked up again.
  String patchUrl = String(SUPABASE_URL) + "/rest/v1/robot_commands?id=eq." + String(cmdId);
  HTTPClient patchHttp;
  if (patchHttp.begin(patchUrl)) {
    patchHttp.addHeader("apikey", SUPABASE_ANON_KEY);
    patchHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    patchHttp.addHeader("Content-Type", "application/json");
    patchHttp.PATCH("{\"executed\":true}");
    patchHttp.end();
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\nESP32-CAM starting...");

  if (!initCamera()) {
    Serial.println("Camera init failed. Halting.");
    while (true) delay(1000);
  }
  Serial.println("Camera init OK.");

  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    pushCamStatus();  // don't wait for the first HEARTBEAT_INTERVAL_MS tick —
                       // the main board's isCameraOnline() check could run
                       // before then otherwise.
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = now;
    pushCamStatus();
  }

  if (now - lastCommandPoll >= COMMAND_POLL_MS) {
    lastCommandPoll = now;
    pollForCameraCheckCommand();
  }

  if (now - lastUpload >= UPLOAD_INTERVAL_MS) {
    lastUpload = now;

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed.");
      return;
    }

    uploadFrame(fb);
    esp_camera_fb_return(fb);
  }
}
