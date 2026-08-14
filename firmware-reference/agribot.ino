#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ESP32Servo.h>

// ---------------- WiFi / Supabase config ----------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SUPABASE_URL         = "https://YOUR_PROJECT_REF.supabase.co";
const char* SUPABASE_SERVICE_KEY = "YOUR_SERVICE_ROLE_KEY";
const char* ROBOT_ID = "agribot-01";

// ---------------- Pin map ----------------
#define ENA_PIN 25
#define IN1_PIN 26
#define IN2_PIN 27
#define ENB_PIN 14
#define IN3_PIN 13
#define IN4_PIN 23
#define DHT_PIN 4
#define DHT_TYPE DHT22
#define SOIL_PIN 32
#define TRIG_PIN 18
#define ECHO_PIN 19
#define RELAY_PIN 33
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define SERVO_PIN 15
#define SERVO_UP_ANGLE   0
#define SERVO_DOWN_ANGLE 90

// ---------------- Timing ----------------
const unsigned long SENSOR_INTERVAL_MS  = 10000;
const unsigned long STATUS_INTERVAL_MS  = 5000;
const unsigned long COMMAND_POLL_MS     = 2000;
unsigned long lastSensorPush = 0, lastStatusPush = 0, lastCommandPoll = 0;

// ---------------- State ----------------
DHT dht(DHT_PIN, DHT_TYPE);
HardwareSerial gpsSerial(2);
TinyGPSPlus gps;
Servo probeServo;
bool probeDown = false;
String currentMode = "manual";
bool pumpStatus = false;
String motorState = "stopped";
int speedValue = 200;

void setup() {
  Serial.begin(115200);
  pinMode(ENA_PIN, OUTPUT); pinMode(IN1_PIN, OUTPUT); pinMode(IN2_PIN, OUTPUT);
  pinMode(ENB_PIN, OUTPUT); pinMode(IN3_PIN, OUTPUT); pinMode(IN4_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT); pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  digitalWrite(RELAY_PIN, LOW);
  stopMotors();
  dht.begin();
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  probeServo.attach(SERVO_PIN);
  probeServo.write(SERVO_UP_ANGLE);
  probeDown = false;
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  while (gpsSerial.available() > 0) gps.encode(gpsSerial.read());
  unsigned long now = millis();
  if (now - lastSensorPush >= SENSOR_INTERVAL_MS)  { lastSensorPush = now; pushSensorData(); }
  if (now - lastStatusPush >= STATUS_INTERVAL_MS)  { lastStatusPush = now; pushRobotStatus(); }
  if (now - lastCommandPoll >= COMMAND_POLL_MS)    { lastCommandPoll = now; pollCommands(); }
}

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) { delay(500); Serial.print("."); attempts++; }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) { Serial.print("Connected, IP: "); Serial.println(WiFi.localIP()); }
  else Serial.println("WiFi connect failed, will retry in loop.");
}

float readUltrasonicCm() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1;
  return duration * 0.0343 / 2.0;
}

float readBatteryVoltage() { return -1; }

void pushSensorData() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  int soilRaw = analogRead(SOIL_PIN);
  float distance = readUltrasonicCm();
  float batteryVoltage = readBatteryVoltage();
  double lat = gps.location.isValid() ? gps.location.lat() : 0;
  double lng = gps.location.isValid() ? gps.location.lng() : 0;

  StaticJsonDocument<512> doc;
  doc["soil_moisture"] = soilRaw;
  if (!isnan(temperature)) doc["temperature"] = temperature;
  if (!isnan(humidity))    doc["humidity"] = humidity;
  if (distance > 0)        doc["distance_cm"] = distance;
  if (batteryVoltage > 0)  doc["battery_voltage"] = batteryVoltage;
  if (gps.location.isValid()) { doc["latitude"] = lat; doc["longitude"] = lng; }

  String payload;
  serializeJson(doc, payload);
  httpPost(String(SUPABASE_URL) + "/rest/v1/sensor_data", payload);
}

void pushRobotStatus() {
  StaticJsonDocument<256> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["online"] = true;
  doc["mode"] = currentMode;
  doc["pump_status"] = pumpStatus;
  doc["motor_state"] = motorState;
  doc["speed_value"] = speedValue;
  doc["updated_at"] = "now()";
  String payload;
  serializeJson(doc, payload);
  httpPost(String(SUPABASE_URL) + "/rest/v1/robot_status?on_conflict=robot_id", payload, true);
}

void pollCommands() {
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?robot_id=eq." + ROBOT_ID +
    "&executed=eq.false&order=created_at.asc&limit=5";
  HTTPClient http;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  int code = http.GET();
  if (code == 200) {
    String response = http.getString();
    DynamicJsonDocument doc(2048);
    if (!deserializeJson(doc, response)) {
      for (JsonObject cmd : doc.as<JsonArray>()) {
        long id = cmd["id"];
        String command = cmd["command"].as<String>();
        int value = cmd["value"].isNull() ? -1 : cmd["value"].as<int>();
        executeCommand(command, value);
        markCommandExecuted(id);
      }
    }
  } else if (code > 0) Serial.printf("Command poll failed, HTTP %d\n", code);
  http.end();
}

void markCommandExecuted(long id) {
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?id=eq." + String(id);
  StaticJsonDocument<128> doc;
  doc["executed"] = true;
  doc["executed_at"] = "now()";
  String payload;
  serializeJson(doc, payload);
  HTTPClient http;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.PATCH(payload);
  http.end();
}

void executeCommand(String command, int value) {
  Serial.print("Executing: "); Serial.println(command);
  if (command == "forward")            { driveForward(); motorState = "forward"; }
  else if (command == "backward")      { driveBackward(); motorState = "backward"; }
  else if (command == "left")          { turnLeft(); motorState = "left"; }
  else if (command == "right")         { turnRight(); motorState = "right"; }
  else if (command == "stop")          { stopMotors(); motorState = "stopped"; }
  else if (command == "pump_on")       { digitalWrite(RELAY_PIN, HIGH); pumpStatus = true; }
  else if (command == "pump_off")      { digitalWrite(RELAY_PIN, LOW); pumpStatus = false; }
  else if (command == "set_speed" && value >= 0 && value <= 255) { speedValue = value; applySpeed(); }
  else if (command == "set_mode_auto")   { currentMode = "auto"; }
  else if (command == "set_mode_manual") { currentMode = "manual"; }
  else if (command == "probe_down")      { lowerProbe(); }
  else if (command == "probe_up")        { raiseProbe(); }
}

void lowerProbe() { probeServo.write(SERVO_DOWN_ANGLE); probeDown = true; delay(700); }
void raiseProbe() { probeServo.write(SERVO_UP_ANGLE); probeDown = false; delay(700); }

void applySpeed() { analogWrite(ENA_PIN, speedValue); analogWrite(ENB_PIN, speedValue); }

void driveForward()  { digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);  digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW);  applySpeed(); }
void driveBackward() { digitalWrite(IN1_PIN,LOW);  digitalWrite(IN2_PIN,HIGH); digitalWrite(IN3_PIN,LOW);  digitalWrite(IN4_PIN,HIGH); applySpeed(); }
void turnLeft()       { digitalWrite(IN1_PIN,LOW);  digitalWrite(IN2_PIN,HIGH); digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW);  applySpeed(); }
void turnRight()      { digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);  digitalWrite(IN3_PIN,LOW);  digitalWrite(IN4_PIN,HIGH); applySpeed(); }
void stopMotors()     { digitalWrite(IN1_PIN,LOW); digitalWrite(IN2_PIN,LOW); digitalWrite(IN3_PIN,LOW); digitalWrite(IN4_PIN,LOW); analogWrite(ENA_PIN,0); analogWrite(ENB_PIN,0); }

void httpPost(String url, String payload, bool upsert = false) {
  HTTPClient http;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  http.addHeader("Content-Type", "application/json");
  if (upsert) http.addHeader("Prefer", "resolution=merge-duplicates");
  int code = http.POST(payload);
  if (code < 0) Serial.printf("POST failed: %s\n", http.errorToString(code).c_str());
  else if (code >= 300) Serial.printf("POST %s -> HTTP %d: %s\n", url.c_str(), code, http.getString().c_str());
  http.end();
}
