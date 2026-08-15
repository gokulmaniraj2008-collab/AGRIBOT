/* AGRIBOT ESP32 firmware
   Soil moisture: GPIO35 / ADC1
   DHT22: GPIO4
   Supabase heartbeat + sensor + command sync
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ESP32Servo.h>

const char* WIFI_SSID = "AGRIBOT_WIFI";
const char* WIFI_PASSWORD = "12345678";
const char* SUPABASE_URL = "https://hvnasippwadzygnaodpp.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bmFzaXBwd2FkenlnbmFvZHBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTkyODc0MywiZXhwIjoyMDkxNTA0NzQzfQ.iNgdptmdbDdq94f_QNVFIcRD3Ny8eb9tVp2q1nMGbX8";  // your service_role key
const char* ROBOT_ID = "agribot-01";
const char* ROBOT_NAME = "AgriBot 01";

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
#define BATTERY_PIN 34

const int SOIL_DRY_RAW = 3200;
const int SOIL_WET_RAW = 800;

const int SOIL_FLOATING_FLOOR_RAW = 50;
const float BATTERY_FLOATING_FLOOR_V = 1.0f;

const float R1_OHMS = 100000.0f;
const float R2_OHMS = 33000.0f;
const float ADC_REF_V = 3.3f;
const float ADC_MAX_COUNTS = 4095.0f;
const float BATTERY_MAX_V = 12.6f;
const float BATTERY_MIN_V = 9.0f;

const unsigned long SENSOR_INTERVAL_MS = 10000;
const unsigned long STATUS_INTERVAL_MS = 5000;
const unsigned long COMMAND_POLL_MS = 2000;
const unsigned long MESSAGE_POLL_MS = 3000;

// --- Patrol / plant-spacing calibration ---
const unsigned long MS_PER_PLANT_STEP = 1500;   // start estimate, recalibrate
const unsigned long PATROL_SETTLE_MS = 500;
const float PATROL_OBSTACLE_STOP_CM = 15.0f;

unsigned long lastSensorPush = 0;
unsigned long lastStatusPush = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastMessagePoll = 0;

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

int postJson(const String& url, const String& payload, bool upsert) {
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(url)) return -1;
  addHeaders(http);
  if (upsert) http.addHeader("Prefer", "resolution=merge-duplicates,return=minimal");
  int code = http.POST(payload);
  if (code >= 300 || code < 0) Serial.printf("POST HTTP %d: %s\n", code, http.getString().c_str());
  http.end();
  return code;
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print('.'); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK, IP: "); Serial.println(WiFi.localIP());
    digitalWrite(LED_WIFI_PIN, HIGH);
  } else {
    Serial.println("WiFi connection failed");
    digitalWrite(LED_WIFI_PIN, LOW);
  }
}

void pushRobotStatus() {
  if (WiFi.status() != WL_CONNECTED) return;
  StaticJsonDocument<256> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["name"] = ROBOT_NAME;
  doc["online"] = true;
  doc["mode"] = currentMode;
  doc["pump_status"] = pumpStatus;
  doc["motor_state"] = motorState;
  doc["speed_value"] = speedValue;
  String payload; serializeJson(doc, payload);
  String url = String(SUPABASE_URL) + "/rest/v1/robot_status?on_conflict=robot_id";
  int code = postJson(url, payload, true);
  if (code >= 200 && code < 300) Serial.println("Supabase heartbeat: ONLINE");
}

float readUltrasonicCm() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  return duration ? duration * 0.0343f / 2.0f : -1;
}

int readSoilRaw() {
  long total = 0;
  const int samples = 15;
  for (int i = 0; i < samples; i++) {
    total += analogRead(SOIL_PIN);
    delay(3);
  }
  return (int)(total / samples);
}

float readSoilPercent(int& outRaw) {
  outRaw = readSoilRaw();
  if (outRaw < SOIL_FLOATING_FLOOR_RAW) {
    Serial.println("Soil sensor appears unconnected (raw near 0) - skipping reading");
    return NAN;
  }
  long percent = map(outRaw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  percent = constrain(percent, 0L, 100L);
  Serial.printf("Soil RAW=%d  Moisture=%ld%%\n", outRaw, percent);
  return (float)percent;
}

float readBatteryPercent(float& outVoltage) {
  int raw = analogRead(BATTERY_PIN);
  float pinVoltage = (raw / ADC_MAX_COUNTS) * ADC_REF_V;
  float batteryVoltage = pinVoltage * (R1_OHMS + R2_OHMS) / R2_OHMS;
  outVoltage = batteryVoltage;
  if (batteryVoltage < BATTERY_FLOATING_FLOOR_V) {
    Serial.println("Battery sensor appears unconnected (voltage near 0) - skipping reading");
    return NAN;
  }
  float percent = (batteryVoltage - BATTERY_MIN_V) / (BATTERY_MAX_V - BATTERY_MIN_V) * 100.0f;
  return constrain(percent, 0.0f, 100.0f);
}

void pushSensorData() {
  if (WiFi.status() != WL_CONNECTED) return;

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  if (isnan(temperature) || isnan(humidity))
    Serial.println("WARN: DHT22 read failed (NaN) - check wiring/power on DHT_PIN");

  int soilRaw = 0;
  float soilPercent = readSoilPercent(soilRaw);
  float distance = readUltrasonicCm();
  float batteryVoltage = 0;
  float batteryPercent = readBatteryPercent(batteryVoltage);

  StaticJsonDocument<640> doc;
  if (!isnan(soilPercent)) doc["soil_moisture"] = soilPercent;
  if (!isnan(batteryPercent)) {
    doc["battery_voltage"] = batteryVoltage;
    doc["battery_percent"] = batteryPercent;
  }
  if (!isnan(temperature)) doc["temperature"] = temperature;
  if (!isnan(humidity)) doc["humidity"] = humidity;
  if (distance > 0) doc["distance_cm"] = distance;
  if (gps.location.isValid()) {
    doc["latitude"] = gps.location.lat();
    doc["longitude"] = gps.location.lng();
  }

  String payload; serializeJson(doc, payload);
  postJson(String(SUPABASE_URL) + "/rest/v1/sensor_data", payload, false);

  static bool lowBatteryWarned = false;
  if (!isnan(batteryPercent) && batteryPercent < 15.0f && !lowBatteryWarned) {
    pushMessage("Battery low: " + String(batteryPercent, 0) + "%. Consider recharging soon.", "warning");
    lowBatteryWarned = true;
  } else if (!isnan(batteryPercent) && batteryPercent > 25.0f) {
    lowBatteryWarned = false;
  }
}

void stopMotors() {
  digitalWrite(IN1_PIN, LOW); digitalWrite(IN2_PIN, LOW);
  digitalWrite(IN3_PIN, LOW); digitalWrite(IN4_PIN, LOW);
  analogWrite(ENA_PIN, 0); analogWrite(ENB_PIN, 0);
}

void applySpeed() {
  analogWrite(ENA_PIN, speedValue);
  analogWrite(ENB_PIN, speedValue);
}

// Drives forward one "plant step," watching the ultrasonic sensor the
// whole time so it can stop early if something is in the way.
bool driveOnePlantStep() {
  digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);
  digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW);
  motorState = "forward";
  applySpeed();

  unsigned long stepStart = millis();
  bool obstacle = false;
  while (millis() - stepStart < MS_PER_PLANT_STEP) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    float dist = readUltrasonicCm();
    if (dist > 0 && dist < PATROL_OBSTACLE_STOP_CM) {
      obstacle = true;
      break;
    }
    delay(20);
  }

  stopMotors();
  motorState = "stopped";
  return !obstacle;
}

// Drives to each plant in a row, stopping at each one to read soil
// moisture and push the result to Supabase.
void patrolRow(int numPlants) {
  if (numPlants <= 0) numPlants = 1;
  pushMessage("Patrol started: checking " + String(numPlants) + " plant(s)", "info");

  for (int plantIndex = 1; plantIndex <= numPlants; plantIndex++) {
    bool reachedPlant = driveOnePlantStep();
    if (!reachedPlant) {
      pushMessage("Patrol stopped early: obstacle detected before plant " + String(plantIndex), "warning");
      return;
    }

    delay(PATROL_SETTLE_MS);

    int soilRaw = 0;
    float soilPercent = readSoilPercent(soilRaw);

    if (isnan(soilPercent)) {
      pushMessage("Plant " + String(plantIndex) + ": soil sensor reading failed", "warning");
    } else {
      pushMessage("Plant " + String(plantIndex) + " soil moisture: " + String(soilPercent, 0) + "%", "success");

      if (WiFi.status() == WL_CONNECTED) {
        StaticJsonDocument<256> doc;
        doc["soil_moisture"] = soilPercent;
        doc["plant_index"] = plantIndex;
        if (gps.location.isValid()) {
          doc["latitude"] = gps.location.lat();
          doc["longitude"] = gps.location.lng();
        }
        String payload; serializeJson(doc, payload);
        postJson(String(SUPABASE_URL) + "/rest/v1/sensor_data", payload, false);
      }

      if (soilPercent < 30.0f) {
        pushMessage("Plant " + String(plantIndex) + " is dry (" + String(soilPercent, 0) + "%)", "warning");
      }
    }
  }

  pushMessage("Patrol complete: " + String(numPlants) + " plant(s) checked", "success");
}

void executeCommand(const String& command, int value) {
  if (command == "forward") {
    digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW); digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW); motorState="forward";
  } else if (command == "backward") {
    digitalWrite(IN1_PIN,LOW); digitalWrite(IN2_PIN,HIGH); digitalWrite(IN3_PIN,LOW); digitalWrite(IN4_PIN,HIGH); motorState="backward";
  } else if (command == "left") {
    digitalWrite(IN1_PIN,LOW); digitalWrite(IN2_PIN,HIGH); digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW); motorState="left";
  } else if (command == "right") {
    digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW); digitalWrite(IN3_PIN,LOW); digitalWrite(IN4_PIN,HIGH); motorState="right";
  } else if (command == "stop") {
    stopMotors(); motorState="stopped";
  } else if (command == "pump_on") {
    digitalWrite(RELAY_PIN,HIGH); digitalWrite(LED_PUMP_PIN,HIGH); pumpStatus=true;
  } else if (command == "pump_off") {
    digitalWrite(RELAY_PIN,LOW); digitalWrite(LED_PUMP_PIN,LOW); pumpStatus=false;
  } else if (command == "set_speed" && value >= 0 && value <= 255) {
    speedValue=value;
  } else if (command == "set_mode_auto") {
    currentMode="auto";
  } else if (command == "set_mode_manual") {
    currentMode="manual";
  } else if (command == "patrol_row") {
    patrolRow(value > 0 ? value : 1);
  }
  applySpeed();

  if (command == "pump_on") {
    pushMessage("Pump turned ON", "success");
  } else if (command == "pump_off") {
    pushMessage("Pump turned OFF", "success");
  } else if (command == "forward" || command == "backward" || command == "left" || command == "right") {
    pushMessage("Motor running: " + motorState, "success");
  } else if (command == "stop") {
    pushMessage("Motor stopped", "success");
  } else if (command == "set_speed") {
    pushMessage("Speed set to " + String(speedValue), "success");
  } else if (command == "set_mode_auto" || command == "set_mode_manual") {
    pushMessage("Mode switched to " + currentMode, "success");
  }
}

void markCommandExecuted(long id) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?id=eq." + String(id);
  if (!http.begin(url)) return;
  addHeaders(http); http.addHeader("Prefer", "return=minimal");
  http.PATCH("{\"executed\":true}"); http.end();
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?robot_id=eq." + ROBOT_ID + "&executed=eq.false&order=created_at.asc&limit=5";
  HTTPClient http; if (!http.begin(url)) return;
  addHeaders(http); int code = http.GET();
  if (code == 200) {
    DynamicJsonDocument doc(4096);
    if (!deserializeJson(doc, http.getString())) {
      for (JsonObject cmd : doc.as<JsonArray>()) {
        long id=cmd["id"]|0; String command=cmd["command"]|""; int value=cmd["value"].isNull()?-1:(int)cmd["value"];
        executeCommand(command,value); markCommandExecuted(id);
      }
    }
  } else if (code >= 300) Serial.printf("Command poll HTTP %d: %s\n", code, http.getString().c_str());
  http.end();
}

void pushMessage(const String& message, const String& level) {
  Serial.printf("[TO WEBSITE] (%s) %s\n", level.c_str(), message.c_str());
  if (WiFi.status() != WL_CONNECTED) return;
  StaticJsonDocument<384> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["origin"] = "esp32";
  doc["level"] = level;
  doc["message"] = message;
  String payload; serializeJson(doc, payload);
  String url = String(SUPABASE_URL) + "/rest/v1/device_messages";
  postJson(url, payload, false);
}

void pollIncomingMessages() {
  if (WiFi.status() != WL_CONNECTED) return;
  String url = String(SUPABASE_URL) + "/rest/v1/device_messages?robot_id=eq." + ROBOT_ID
             + "&origin=eq.website&read=eq.false&order=created_at.asc&limit=5";
  HTTPClient http; if (!http.begin(url)) return;
  addHeaders(http); int code = http.GET();
  if (code == 200) {
    DynamicJsonDocument doc(2048);
    if (!deserializeJson(doc, http.getString())) {
      for (JsonObject m : doc.as<JsonArray>()) {
        long id = m["id"] | 0;
        String text = m["message"] | "";
        Serial.printf("[FROM WEBSITE] %s\n", text.c_str());

        HTTPClient patchHttp;
        String patchUrl = String(SUPABASE_URL) + "/rest/v1/device_messages?id=eq." + String(id);
        if (patchHttp.begin(patchUrl)) {
          addHeaders(patchHttp); patchHttp.addHeader("Prefer", "return=minimal");
          patchHttp.PATCH("{\"read\":true}"); patchHttp.end();
        }
      }
    }
  } else if (code >= 300) Serial.printf("Message poll HTTP %d: %s\n", code, http.getString().c_str());
  http.end();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);

  pinMode(ENA_PIN,OUTPUT); pinMode(IN1_PIN,OUTPUT); pinMode(IN2_PIN,OUTPUT);
  pinMode(IN3_PIN,OUTPUT); pinMode(IN4_PIN,OUTPUT); pinMode(ENB_PIN,OUTPUT);
  pinMode(RELAY_PIN,OUTPUT); pinMode(TRIG_PIN,OUTPUT); pinMode(ECHO_PIN,INPUT);
  pinMode(LED_WIFI_PIN,OUTPUT); pinMode(LED_PUMP_PIN,OUTPUT);
  digitalWrite(RELAY_PIN,LOW); stopMotors();
  dht.begin();
  gpsSerial.begin(9600,SERIAL_8N1,GPS_RX_PIN,GPS_TX_PIN);
  probeServo.attach(SERVO_PIN); probeServo.write(0);
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    pushRobotStatus();
    pushMessage("AGRIBOT online and connected.", "success");
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
  unsigned long now=millis();
  if (now-lastSensorPush >= SENSOR_INTERVAL_MS) { lastSensorPush=now; pushSensorData(); }
  if (now-lastStatusPush >= STATUS_INTERVAL_MS) { lastStatusPush=now; pushRobotStatus(); }
  if (now-lastCommandPoll >= COMMAND_POLL_MS) { lastCommandPoll=now; pollCommands(); }
  if (now-lastMessagePoll >= MESSAGE_POLL_MS) { lastMessagePoll=now; pollIncomingMessages(); }
}
