/*
  AGRIBOT — ESP32 firmware reference
  Supabase connectivity + sensor/status/command sync.

  SECURITY:
  Do NOT put a Supabase service_role key in this file or commit it to GitHub.
  Use the anon/publishable key only if your database RLS policies permit the
  device operations, or preferably put device authentication behind a secure
  server/Edge Function. The old exposed service_role key must be rotated.

  Current wiring map:
    L298N ENA=14, IN1=27, IN2=26, IN3=25, IN4=33, ENB=32
    DHT22=4, Soil AO=35, HC-SR04 Trig=18 Echo=19
    Relay IN=23, GPS RX=16 TX=17, Servo=15
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ESP32Servo.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* SUPABASE_URL = "https://hvnasippwadzygnaodpp.supabase.co";
// Use a publishable/anon key only. Never commit a service_role key.
const char* SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
const char* ROBOT_ID = "agribot-01";

#define ENA_PIN 14
#define IN1_PIN 27
#define IN2_PIN 26
#define IN3_PIN 25
#define IN4_PIN 33
#define ENB_PIN 32
#define DHT_PIN 4
#define DHT_TYPE DHT22
#define SOIL_PIN 35
#define TRIG_PIN 18
#define ECHO_PIN 19
#define RELAY_PIN 23
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define SERVO_PIN 15
#define LED_WIFI_PIN 21
#define LED_PUMP_PIN 22

const unsigned long SENSOR_INTERVAL_MS = 10000;
const unsigned long STATUS_INTERVAL_MS = 5000;
const unsigned long COMMAND_POLL_MS = 2000;

unsigned long lastSensorPush = 0;
unsigned long lastStatusPush = 0;
unsigned long lastCommandPoll = 0;

DHT dht(DHT_PIN, DHT_TYPE);
HardwareSerial gpsSerial(2);
TinyGPSPlus gps;
Servo probeServo;

String currentMode = "manual";
bool pumpStatus = false;
String motorState = "stopped";
int speedValue = 200;

void addHeaders(HTTPClient& http) {
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK, IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_WIFI_PIN, HIGH);
  } else {
    Serial.println("WiFi connection failed");
    digitalWrite(LED_WIFI_PIN, LOW);
  }
}

int postJson(const String& url, const String& payload, bool upsert) {
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(url)) return -1;
  addHeaders(http);
  if (upsert) http.addHeader("Prefer", "resolution=merge-duplicates,return=minimal");
  int code = http.POST(payload);
  if (code >= 300 || code < 0) {
    Serial.printf("POST HTTP %d: %s\n", code, http.getString().c_str());
  }
  http.end();
  return code;
}

void pushRobotStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<256> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["online"] = true;
  doc["mode"] = currentMode;
  doc["pump_status"] = pumpStatus;
  doc["motor_state"] = motorState;
  doc["speed_value"] = speedValue;

  String payload;
  serializeJson(doc, payload);

  // The database should supply updated_at with its default timestamp.
  String url = String(SUPABASE_URL) + "/rest/v1/robot_status?on_conflict=robot_id";
  int code = postJson(url, payload, true);
  if (code >= 200 && code < 300) Serial.println("Supabase heartbeat: ONLINE");
}

float readUltrasonicCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  return duration ? duration * 0.0343f / 2.0f : -1;
}

void pushSensorData() {
  if (WiFi.status() != WL_CONNECTED) return;

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  int soilRaw = analogRead(SOIL_PIN);
  float distance = readUltrasonicCm();

  StaticJsonDocument<512> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["soil_moisture"] = soilRaw;
  if (!isnan(temperature)) doc["temperature"] = temperature;
  if (!isnan(humidity)) doc["humidity"] = humidity;
  if (distance > 0) doc["distance_cm"] = distance;
  if (gps.location.isValid()) {
    doc["latitude"] = gps.location.lat();
    doc["longitude"] = gps.location.lng();
  }

  String payload;
  serializeJson(doc, payload);
  postJson(String(SUPABASE_URL) + "/rest/v1/sensor_data", payload, false);
}

void executeCommand(const String& command, int value) {
  if (command == "forward") {
    digitalWrite(IN1_PIN, HIGH); digitalWrite(IN2_PIN, LOW);
    digitalWrite(IN3_PIN, HIGH); digitalWrite(IN4_PIN, LOW);
    motorState = "forward";
  } else if (command == "backward") {
    digitalWrite(IN1_PIN, LOW); digitalWrite(IN2_PIN, HIGH);
    digitalWrite(IN3_PIN, LOW); digitalWrite(IN4_PIN, HIGH);
    motorState = "backward";
  } else if (command == "left") {
    digitalWrite(IN1_PIN, LOW); digitalWrite(IN2_PIN, HIGH);
    digitalWrite(IN3_PIN, HIGH); digitalWrite(IN4_PIN, LOW);
    motorState = "left";
  } else if (command == "right") {
    digitalWrite(IN1_PIN, HIGH); digitalWrite(IN2_PIN, LOW);
    digitalWrite(IN3_PIN, LOW); digitalWrite(IN4_PIN, HIGH);
    motorState = "right";
  } else if (command == "stop") {
    stopMotors();
    motorState = "stopped";
  } else if (command == "pump_on") {
    digitalWrite(RELAY_PIN, HIGH);
    digitalWrite(LED_PUMP_PIN, HIGH);
    pumpStatus = true;
  } else if (command == "pump_off") {
    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(LED_PUMP_PIN, LOW);
    pumpStatus = false;
  } else if (command == "set_speed" && value >= 0 && value <= 255) {
    speedValue = value;
  } else if (command == "set_mode_auto") {
    currentMode = "auto";
  } else if (command == "set_mode_manual") {
    currentMode = "manual";
  }
  applySpeed();
}

void markCommandExecuted(long id) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?id=eq." + String(id);
  if (!http.begin(url)) return;
  addHeaders(http);
  http.addHeader("Prefer", "return=minimal");
  http.PATCH("{\"executed\":true}");
  http.end();
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?robot_id=eq." + ROBOT_ID + "&executed=eq.false&order=created_at.asc&limit=5";
  HTTPClient http;
  if (!http.begin(url)) return;
  addHeaders(http);
  int code = http.GET();
  if (code == 200) {
    DynamicJsonDocument doc(4096);
    if (!deserializeJson(doc, http.getString())) {
      for (JsonObject cmd : doc.as<JsonArray>()) {
        long id = cmd["id"] | 0;
        String command = cmd["command"] | "";
        int value = cmd["value"].isNull() ? -1 : (int)cmd["value"];
        executeCommand(command, value);
        markCommandExecuted(id);
      }
    }
  } else if (code >= 300) {
    Serial.printf("Command poll HTTP %d: %s\n", code, http.getString().c_str());
  }
  http.end();
}

void applySpeed() {
  analogWrite(ENA_PIN, speedValue);
  analogWrite(ENB_PIN, speedValue);
}

void stopMotors() {
  digitalWrite(IN1_PIN, LOW); digitalWrite(IN2_PIN, LOW);
  digitalWrite(IN3_PIN, LOW); digitalWrite(IN4_PIN, LOW);
  analogWrite(ENA_PIN, 0);
  analogWrite(ENB_PIN, 0);
}

void setup() {
  Serial.begin(115200);
  pinMode(ENA_PIN, OUTPUT); pinMode(IN1_PIN, OUTPUT); pinMode(IN2_PIN, OUTPUT);
  pinMode(IN3_PIN, OUTPUT); pinMode(IN4_PIN, OUTPUT); pinMode(ENB_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT); pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  pinMode(LED_WIFI_PIN, OUTPUT); pinMode(LED_PUMP_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  stopMotors();
  dht.begin();
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  probeServo.attach(SERVO_PIN);
  probeServo.write(0);
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) pushRobotStatus();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  while (gpsSerial.available()) gps.encode(gpsSerial.read());

  unsigned long now = millis();
  if (now - lastSensorPush >= SENSOR_INTERVAL_MS) {
    lastSensorPush = now;
    pushSensorData();
  }
  if (now - lastStatusPush >= STATUS_INTERVAL_MS) {
    lastStatusPush = now;
    pushRobotStatus();
  }
  if (now - lastCommandPoll >= COMMAND_POLL_MS) {
    lastCommandPoll = now;
    pollCommands();
  }
}
