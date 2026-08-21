// ===================================================================
// AGRIBOT — ESP32 main sketch
// WiFi + Supabase sync: pulls robot_commands, posts sensor_data
// ===================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>   // "ArduinoJson" by Benoit Blanchon
#include <DHT.h>           // "DHT sensor library" by Adafruit
#include <TinyGPS++.h>     // "TinyGPSPlus" by Mikal Hart
#include <HardwareSerial.h>

// ---------------- CONFIG ----------------
const char* WIFI_SSID     = "AGRIBOT_WIFI";
const char* WIFI_PASSWORD = "12345678";

const char* SUPABASE_URL      = "https://hvnasippwadzygnaodpp.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bmFzaXBwd2FkenlnbmFvZHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjg3NDMsImV4cCI6MjA5MTUwNDc0M30.dcS0J77idvjkwNesRJS7C-LfmhSDlILASMK65AesRaM";

const char* ROBOT_ID = "agribot-01";

// ---------------- MOTOR PINS (L298N) ----------------
#define ENA 25
#define IN1 26
#define IN2 27
#define ENB 14
#define IN3 12
#define IN4 13
int currentSpeed = 180;

// ---------------- RELAY (pump) ----------------
#define RELAY_PIN 19

// ---------------- SENSOR PINS ----------------
#define SOIL_PIN     34
#define DHT_PIN      4
#define DHT_TYPE     DHT22
#define TRIG_PIN     5
#define ECHO_PIN     18
#define BATTERY_PIN  35

DHT dht(DHT_PIN, DHT_TYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2); // UART2: RX=16, TX=17

// ---------------- TIMING ----------------
unsigned long lastCommandPoll = 0;
unsigned long lastSensorPost  = 0;
const unsigned long COMMAND_POLL_INTERVAL = 2000;   // 2s
const unsigned long SENSOR_POST_INTERVAL  = 15000;  // 15s

// ===================================================================
// SETUP
// ===================================================================
void setup() {
  Serial.begin(115200);

  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  stopMotors();

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  dht.begin();
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);

  connectWiFi();
}

// ===================================================================
// LOOP
// ===================================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastCommandPoll >= COMMAND_POLL_INTERVAL) {
    lastCommandPoll = now;
    pollCommands();
  }

  if (now - lastSensorPost >= SENSOR_POST_INTERVAL) {
    lastSensorPost = now;
    postSensorData();
  }
}

// ===================================================================
// WIFI
// ===================================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - startAttempt > 15000) {
      Serial.println("\nWiFi connect timed out, will retry in loop()");
      return;
    }
  }
  Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
}

// ===================================================================
// MOTORS
// ===================================================================
void motorForward() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  analogWrite(ENA, currentSpeed);
  analogWrite(ENB, currentSpeed);
}

void motorBackward() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  analogWrite(ENA, currentSpeed);
  analogWrite(ENB, currentSpeed);
}

void motorLeft() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  analogWrite(ENA, currentSpeed);
  analogWrite(ENB, currentSpeed);
}

void motorRight() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  analogWrite(ENA, currentSpeed);
  analogWrite(ENB, currentSpeed);
}

void stopMotors() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void setMotorSpeed(int speed) {
  currentSpeed = constrain(speed, 0, 255);
}

// ===================================================================
// COMMAND POLLING (robot_commands table)
// ===================================================================
void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) +
    "/rest/v1/robot_commands?robot_id=eq." + ROBOT_ID +
    "&executed=eq.false&order=created_at.asc&limit=1";

  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  int httpCode = http.GET();
  if (httpCode != 200) { http.end(); return; }

  String payload = http.getString();
  http.end();

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, payload) || doc.size() == 0) return;

  JsonObject cmdRow = doc[0];
  long id = cmdRow["id"];
  String command = cmdRow["command"].as<String>();
  int value = cmdRow["value"] | 0;

  executeCommand(command, value);
  markCommandExecuted(id);
}

void executeCommand(String command, int value) {
  if (command == "forward")        motorForward();
  else if (command == "backward")  motorBackward();
  else if (command == "left")      motorLeft();
  else if (command == "right")     motorRight();
  else if (command == "stop")      stopMotors();
  else if (command == "set_speed") setMotorSpeed(value);
  else if (command == "pump_on")   digitalWrite(RELAY_PIN, HIGH);
  else if (command == "pump_off")  digitalWrite(RELAY_PIN, LOW);
  // heater/cooler/vent/irrigation/mission commands: add here as you wire them
}

void markCommandExecuted(long id) {
  // NOTE: executed_at is left out here — set a DB default/trigger for it,
  // since PostgREST won't evaluate now() from a JSON string.
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?id=eq." + String(id);

  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");

  http.PATCH("{\"executed\":true}");
  http.end();
}

// ===================================================================
// SENSORS (sensor_data table)
// ===================================================================
float readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1;
  return duration * 0.0343 / 2.0;
}

float readBatteryVoltage() {
  int raw = analogRead(BATTERY_PIN);
  float vAtPin = (raw / 4095.0) * 3.3;
  float dividerRatio = 3.0; // tune to your actual divider resistors
  return vAtPin * dividerRatio;
}

float voltageToPercent(float v) {
  float pct = (v - 6.0) / (8.4 - 6.0) * 100.0; // 2S Li-ion range
  return constrain(pct, 0, 100);
}

void updateGPS() {
  while (gpsSerial.available() > 0) gps.encode(gpsSerial.read());
}

void postSensorData() {
  if (WiFi.status() != WL_CONNECTED) return;

  float soilRaw = analogRead(SOIL_PIN);
  float soilPct = map(soilRaw, 4095, 0, 0, 100); // tune to your sensor's wet/dry range
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  float dist = readDistanceCM();
  float vbat = readBatteryVoltage();
  float bpct = voltageToPercent(vbat);

  updateGPS();
  double lat = gps.location.isValid() ? gps.location.lat() : 0;
  double lng = gps.location.isValid() ? gps.location.lng() : 0;

  if (isnan(temp) || isnan(hum)) {
    Serial.println("DHT22 read failed, skipping this cycle");
    return;
  }

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/sensor_data");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");

  String body = "{";
  body += "\"robot_id\":\"" + String(ROBOT_ID) + "\",";
  body += "\"soil_moisture\":" + String(soilPct, 1) + ",";
  body += "\"soil_raw\":" + String((int)soilRaw) + ",";
  body += "\"temperature\":" + String(temp, 1) + ",";
  body += "\"humidity\":" + String(hum, 1) + ",";
  body += "\"distance_cm\":" + String(dist, 1) + ",";
  body += "\"battery_voltage\":" + String(vbat, 2) + ",";
  body += "\"battery_percent\":" + String(bpct, 1) + ",";
  body += "\"latitude\":" + String(lat, 6) + ",";
  body += "\"longitude\":" + String(lng, 6);
  body += "}";

  int httpCode = http.POST(body);
  Serial.println("postSensorData: " + String(httpCode));
  http.end();
}
