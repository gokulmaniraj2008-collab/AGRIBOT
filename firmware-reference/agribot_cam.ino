/*
  AGRIBOT — ESP32-CAM Firmware
  ---------------------------------------------------------
  Independent module. Connects to its own WiFi, captures a
  photo every CAPTURE_INTERVAL_MS, and uploads it to Supabase
  Storage. Also inserts a row into plant_images so your
  camera/insights pages can find and display the latest shot.

  Board: AI-Thinker ESP32-CAM (most common variant)

  Flashing instructions:
    1. Connect FTDI adapter: FTDI TX -> U0R, FTDI RX -> U0T,
       FTDI GND -> GND, FTDI 5V -> 5V
    2. Bridge GPIO0 to GND (flashing mode only)
    3. Tools -> Board -> AI Thinker ESP32-CAM
    4. Upload, then remove the GPIO0-GND jumper and power-cycle

  Supabase setup needed before this works:
    - A Storage bucket, e.g. "plant-images" (public or with a
      policy allowing the service_role key to upload)
    - A table "plant_images" with columns:
        id (uuid/int, default), robot_id (text), image_url (text),
        captured_at (timestamptz, default now())

  Libraries needed:
    - esp32-camera (bundled with ESP32 board package, AI Thinker config)
    - WiFi, HTTPClient (built-in)
    - ArduinoJson
*/

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---------------- WiFi / Supabase config ----------------
const char* WIFI_SSID     = "AGRIBOT_WIFI";
const char* WIFI_PASSWORD = "12345678";

const char* SUPABASE_URL         = "https://YOUR_PROJECT_REF.supabase.co";
const char* SUPABASE_SERVICE_KEY = "YOUR_SERVICE_ROLE_KEY"; // keep secret, device-only
const char* SUPABASE_BUCKET      = "plant-images";

const char* ROBOT_ID = "agribot-01";

// ---------------- Timing ----------------
const unsigned long CAPTURE_INTERVAL_MS = 30000; // capture every 30s
unsigned long lastCapture = 0;

// ---------------- AI-Thinker ESP32-CAM pin map ----------------
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

// =========================================================
void setup() {
  Serial.begin(115200);

  if (!initCamera()) {
    Serial.println("Camera init failed — halting.");
    while (true) delay(1000);
  }

  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();
  if (now - lastCapture >= CAPTURE_INTERVAL_MS) {
    lastCapture = now;
    captureAndUpload();
  }
}

// ---------------- Camera init ----------------
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
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
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_SVGA; // 800x600, good balance for plant photos
    config.jpeg_quality = 12;           // lower number = higher quality
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init error 0x%x\n", err);
    return false;
  }
  return true;
}

// ---------------- WiFi ----------------
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connect failed, will retry in loop.");
  }
}

// ---------------- Capture + upload ----------------
void captureAndUpload() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    return;
  }

  String filename = "plant_" + String(ROBOT_ID) + "_" + String(millis()) + ".jpg";
  bool uploaded = uploadToStorage(fb->buf, fb->len, filename);

  esp_camera_fb_return(fb); // release frame buffer back to driver

  if (uploaded) {
    String publicUrl = String(SUPABASE_URL) + "/storage/v1/object/public/" +
                        SUPABASE_BUCKET + "/" + filename;
    insertImageRecord(publicUrl);
  }
}

bool uploadToStorage(uint8_t* data, size_t len, String filename) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/storage/v1/object/" + SUPABASE_BUCKET + "/" + filename;

  http.begin(url);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  http.addHeader("Content-Type", "image/jpeg");

  int code = http.POST(data, len);
  bool success = (code == 200 || code == 201);

  if (!success) {
    Serial.printf("Upload failed, HTTP %d: %s\n", code, http.getString().c_str());
  } else {
    Serial.println("Image uploaded: " + filename);
  }

  http.end();
  return success;
}

void insertImageRecord(String imageUrl) {
  StaticJsonDocument<256> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["image_url"] = imageUrl;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/plant_images");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(payload);
  if (code < 200 || code >= 300) {
    Serial.printf("Record insert failed, HTTP %d: %s\n", code, http.getString().c_str());
  }
  http.end();
}
