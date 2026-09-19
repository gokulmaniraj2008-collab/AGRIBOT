// ============================================================
// AGRIBOT ESP32 - Supabase + local dashboard
//
// POWER ON -> STOP 3 s -> REVERSE -> obstacle < 15 cm -> STOP
// -> servo 90 -> wait 5 s -> check soil
// -> DRY: pump ON, wait 5 s, recheck (max 24 cycles)
// -> soil OK / timeout -> pump OFF -> servo 0
// -> FORWARD 3 s -> PERMANENT STOP
//
// agribot_sensor_data = live readings for the website
// agribot_log         = event history
// Data is sent ONLY while the car is stopped.
// ============================================================

#include <Arduino.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ---------------- WiFi (2.4 GHz, needs internet) ----------------
const char* WIFI_SSID = "AGRIBOT_WIFI";
const char* WIFI_PASS = "12345678";
WebServer server(80);

// ---------------- Supabase (anon key only, never service_role) ----------------
const char* SB_LOG_URL    = "https://hvnasippwadzygnaodpp.supabase.co/rest/v1/agribot_log";
const char* SB_SENSOR_URL = "https://hvnasippwadzygnaodpp.supabase.co/rest/v1/agribot_sensor_data";
const char* SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bmFzaXBwd2FkenlnbmFvZHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjg3NDMsImV4cCI6MjA5MTUwNDc0M30.dcS0J77idvjkwNesRJS7C-LfmhSDlILASMK65AesRaM";

// ---------------- Motors ----------------
#define IN1 27
#define IN2 26
#define ENA 25
#define IN3 33
#define IN4 32
#define ENB 14
#define PWM_FREQ 5000
#define PWM_RES 8
#define MOTOR_SPEED 200

// ---------------- Timing ----------------
#define START_DELAY_MS  3000
#define FORWARD_TIME_MS 3000

// ---------------- Ultrasonic (echo pin needs 5V -> 3.3V divider) ----------------
#define TRIG_PIN 5
#define ECHO_PIN 18
#define STOP_DISTANCE_CM 15

// ---------------- Servo ----------------
#define SERVO_PIN 13
#define SERVO_STOP_ANGLE 90
#define SERVO_NEUTRAL_ANGLE 0
#define SERVO_SETTLE_DELAY 5000
#define SOIL_RECHECK_DELAY 5000
#define MAX_WATER_CYCLES 24

// ---------------- Soil (calibrate these!) ----------------
#define SOIL_PIN 34
#define SOIL_DRY_VALUE 4095
#define SOIL_WET_VALUE 1200
#define SOIL_LOW_THRESHOLD 30

// ---------------- DHT22 ----------------
#define DHT_PIN 15
#define DHT_TYPE DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// ---------------- Relay ----------------
#define RELAY_PIN 4
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

Servo obstacleServo;

// ---------------- State ----------------
bool taskDone = false;
bool finished = false;
unsigned long forwardStart = 0;

String statusText = "Starting...";
String motorMode = "STOPPED";
float lastTemp = 0, lastHum = 0;
int lastSoil = 0;
bool relayState = false;
long lastDistance = -1;

// ============================================================
// Helpers
// ============================================================
void waitMs(unsigned long ms) {
  unsigned long start = millis();
  while (millis() - start < ms) {
    server.handleClient();
    delay(10);
  }
}

long getDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1;
  return (long)(duration * 0.0343 / 2.0);
}

int getSoilMoisturePercent() {
  int raw = analogRead(SOIL_PIN);
  int percent = map(raw, SOIL_DRY_VALUE, SOIL_WET_VALUE, 0, 100);
  return constrain(percent, 0, 100);
}

void readSensors() {
  lastSoil = getSoilMoisturePercent();
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) lastTemp = t;
  if (!isnan(h)) lastHum = h;
}

void motorsForward() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, MOTOR_SPEED);
  ledcWrite(ENB, MOTOR_SPEED);
  motorMode = "FORWARD";
}

void motorsReverse() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  ledcWrite(ENA, MOTOR_SPEED);
  ledcWrite(ENB, MOTOR_SPEED);
  motorMode = "REVERSE";
}

void motorsStop() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0);
  ledcWrite(ENB, 0);
  motorMode = "STOPPED";
}

// ============================================================
// Supabase (call ONLY while the car is stopped)
// ============================================================
void postJson(const char* url, const String& body, const char* tag) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("%s: WiFi disconnected\n", tag);
    return;
  }
  WiFiClientSecure client;
  client.setInsecure();               // skips certificate check (demo use)
  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  if (!http.begin(client, url)) {
    Serial.printf("%s: begin failed\n", tag);
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SB_KEY);
  http.addHeader("Authorization", String("Bearer ") + SB_KEY);
  http.addHeader("Prefer", "return=minimal");
  int code = http.POST(body);
  Serial.printf("%s: %d\n", tag, code);   // 201 = success
  http.end();
}

void logEverything() {
  String relay = relayState ? "true" : "false";

  String sensorBody = "{";
  sensorBody += "\"soil_moisture\":" + String(lastSoil) + ",";
  sensorBody += "\"temperature\":" + String(lastTemp, 1) + ",";
  sensorBody += "\"humidity\":" + String(lastHum, 1) + ",";
  sensorBody += "\"distance_cm\":" + String(lastDistance) + ",";
  sensorBody += "\"relay\":" + relay + ",";
  sensorBody += "\"motor\":\"" + motorMode + "\",";
  sensorBody += "\"status\":\"" + statusText + "\"}";
  postJson(SB_SENSOR_URL, sensorBody, "Sensor");

  String logBody = "{";
  logBody += "\"status\":\"" + statusText + "\",";
  logBody += "\"distance_cm\":" + String(lastDistance) + ",";
  logBody += "\"soil_pct\":" + String(lastSoil) + ",";
  logBody += "\"temp_c\":" + String(lastTemp, 1) + ",";
  logBody += "\"hum_pct\":" + String(lastHum, 1) + ",";
  logBody += "\"relay\":" + relay + ",";
  logBody += "\"motor\":\"" + motorMode + "\"}";
  postJson(SB_LOG_URL, logBody, "History");
}

// ============================================================
// Local dashboard
// ============================================================
void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">
<title>AGRIBOT ESP32</title>
<style>
body{font-family:Arial;background:#111;color:#fff;padding:20px}
.card{background:#222;padding:18px;margin:10px 0;border-radius:12px}
.value{font-size:25px;font-weight:bold}
</style></head><body>
<h1>AGRIBOT</h1>
)rawliteral";

  html += "<div class='card'>Status:<div class='value'>" + statusText + "</div></div>";
  html += "<div class='card'>Soil:<div class='value'>" + String(lastSoil) + " %</div></div>";
  html += "<div class='card'>Temperature:<div class='value'>" + String(lastTemp, 1) + " C</div></div>";
  html += "<div class='card'>Humidity:<div class='value'>" + String(lastHum, 1) + " %</div></div>";
  html += "<div class='card'>Distance:<div class='value'>" + String(lastDistance) + " cm</div></div>";
  html += "<div class='card'>Pump:<div class='value'>" + String(relayState ? "ON" : "OFF") + "</div></div>";
  html += "<div class='card'>Motor:<div class='value'>" + motorMode + "</div></div>";
  html += "</body></html>";

  server.send(200, "text/html", html);
}

// ============================================================
// Setup
// ============================================================
void setup() {
  Serial.begin(115200);

  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(SOIL_PIN, INPUT);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);
  relayState = false;

  dht.begin();

  // Servo attached FIRST (avoids LEDC timer conflict)
  obstacleServo.setPeriodHertz(50);
  obstacleServo.attach(SERVO_PIN, 500, 2400);
  obstacleServo.write(SERVO_NEUTRAL_ANGLE);

  // Motor PWM AFTER servo
  ledcAttach(ENA, PWM_FREQ, PWM_RES);
  ledcAttach(ENB, PWM_FREQ, PWM_RES);
  motorsStop();

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 60) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. Dashboard: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi failed - continuing without dashboard/Supabase");
  }

  server.on("/", handleRoot);
  server.begin();

  // 3 s startup stop
  statusText = "Starting - STOP 3 sec";
  Serial.println(statusText);
  waitMs(START_DELAY_MS);

  lastDistance = getDistanceCM();
  readSensors();
  statusText = "System ready - starting REVERSE";
  Serial.println(statusText);
  logEverything();
}

// ============================================================
// Loop
// ============================================================
void loop() {
  server.handleClient();

  // ---- Forward 3 s, then permanent stop ----
  if (taskDone) {
    if (finished) {
      motorsStop();
      relayState = false;
      digitalWrite(RELAY_PIN, RELAY_OFF);
      statusText = "Finished - STOPPED";
      delay(100);
      return;
    }

    motorsForward();
    statusText = "Task complete - FORWARD";

    if (millis() - forwardStart >= FORWARD_TIME_MS) {
      motorsStop();
      finished = true;
      statusText = "Finished - STOPPED";
      Serial.println(statusText);
      readSensors();
      logEverything();
    }
    delay(100);
    return;
  }

  // ---- Reverse until obstacle ----
  lastDistance = getDistanceCM();

  if (lastDistance != -1 && lastDistance < STOP_DISTANCE_CM) {
    motorsStop();
    statusText = "Obstacle detected - STOPPED";
    Serial.println(statusText);
    readSensors();
    logEverything();

    obstacleServo.write(SERVO_STOP_ANGLE);
    statusText = "Servo 90 deg - settling";
    Serial.println(statusText);
    waitMs(SERVO_SETTLE_DELAY);

    bool soilOK = false;
    int cycles = 0;

    while (!soilOK) {
      readSensors();
      Serial.printf("Soil: %d%%\n", lastSoil);

      if (lastSoil < SOIL_LOW_THRESHOLD) {
        if (cycles >= MAX_WATER_CYCLES) {
          statusText = "Watering timeout - check tank/probe";
          Serial.println(statusText);
          break;
        }
        digitalWrite(RELAY_PIN, RELAY_ON);
        relayState = true;
        cycles++;
        statusText = "Soil DRY - WATERING " + String(cycles) + "/" + String(MAX_WATER_CYCLES);
        Serial.println(statusText);
        logEverything();
        waitMs(SOIL_RECHECK_DELAY);
      } else {
        soilOK = true;
      }
    }

    digitalWrite(RELAY_PIN, RELAY_OFF);
    relayState = false;
    if (soilOK) statusText = "Soil OK - PUMP OFF";
    Serial.println(statusText);
    logEverything();

    obstacleServo.write(SERVO_NEUTRAL_ANGLE);
    waitMs(500);

    taskDone = true;
    forwardStart = millis();
    Serial.println("Starting FORWARD 3 sec");

  } else {
    motorsReverse();
    statusText = "Reversing - no obstacle";
  }

  delay(100);
}
