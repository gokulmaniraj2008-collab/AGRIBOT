/* ============================================================
   AgriBot ESP32 firmware
   Sensor telemetry + command polling + irrigation auto-mode,
   matched to supabase/migrations/0001_init.sql + 0006_climate_control.sql
   ============================================================ */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>          // Adafruit DHT sensor library
#include <TinyGPSPlus.h>  // TinyGPSPlus library

// ---- Pin map ----
// L298N motor driver (both TT motors on a side wired in parallel to one channel)
#define ENA 25   // left side speed (PWM)
#define IN1 26   // left side direction
#define IN2 27
#define ENB 14   // right side speed (PWM)
#define IN3 12   // right side direction
#define IN4 13

// Soil moisture (analog, ADC1 pin — usable with WiFi active)
#define SOIL_PIN 34

// DHT22
#define DHT_PIN 4
#define DHT_TYPE DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// HC-SR04 — ECHO MUST go through a voltage divider (5V -> 3.3V), TRIG does not
#define TRIG_PIN 5
#define ECHO_PIN 18

// Relay controlling the 12V water pump
#define PUMP_RELAY_PIN 19

// Battery voltage sense (ADC1 pin, through a resistor divider — adjust ratio below)
#define BATTERY_PIN 35
#define VOLTAGE_DIVIDER_RATIO 4.03  // (R1+R2)/R2 — set this to match YOUR resistors

// GPS NEO-6M on Serial2 (UART2)
#define GPS_RX_PIN 16  // ESP32 RX2 <- GPS TX
#define GPS_TX_PIN 17  // ESP32 TX2 -> GPS RX
TinyGPSPlus gps;

// PWM setup for motor speed
#define PWM_FREQ 5000
#define PWM_RES_BITS 8
#define PWM_CHANNEL_A 0
#define PWM_CHANNEL_B 1

int currentSpeed = 200; // 0-255, set via set_speed command

// ---- WiFi (2.4GHz only — ESP32 cannot join 5GHz networks) ----
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ---- Supabase ----
// Confirm this is the correct/active project before flashing —
// verify against Settings > API in the Supabase dashboard.
const char* SUPABASE_URL   = "https://YOUR_PROJECT_REF.supabase.co";
// service_role key ONLY — never the anon/publishable key.
// Rotate this key in Supabase before using it here if it has
// ever been shared, logged, or pasted anywhere outside the device.
const char* SERVICE_ROLE_KEY = "YOUR_SERVICE_ROLE_KEY";
const char* ROBOT_ID = "agribot-01";

unsigned long lastSensorPost = 0;
unsigned long lastCommandPoll = 0;
const unsigned long SENSOR_INTERVAL_MS  = 5000;  // telemetry cadence
const unsigned long COMMAND_INTERVAL_MS = 1500;  // command poll cadence

// cached robot_status fields needed for auto-irrigation logic
bool  irrigationAuto = false;
float irrigationThreshold = 30.0;

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");

  setupActuatorPins();

  dht.begin();
  Serial2.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
}

void loop() {
  // GPS needs continuous feeding to parse NMEA sentences
  while (Serial2.available() > 0) {
    gps.encode(Serial2.read());
  }

  unsigned long now = millis();

  if (now - lastSensorPost > SENSOR_INTERVAL_MS) {
    lastSensorPost = now;
    postSensorData();
    runAutoLogic();
  }

  if (now - lastCommandPoll > COMMAND_INTERVAL_MS) {
    lastCommandPoll = now;
    pollCommands();
  }
}

/* ============================================================
   Telemetry — insert a row into sensor_data
   Columns per 0001_init.sql + 0006_climate_control.sql
   ============================================================ */
void postSensorData() {
  StaticJsonDocument<512> doc;

  doc["soil_moisture"]   = readSoilMoisture();
  doc["temperature"]     = readTemperature();
  doc["humidity"]        = readHumidity();
  doc["distance_cm"]     = readUltrasonicDistance();
  doc["battery_voltage"] = readBatteryVoltage();
  doc["battery_percent"] = readBatteryPercent();

  // ph_level, nitrogen, phosphorus, potassium, water_tank_percent
  // are left out on purpose — no sensor hardware for these yet.
  // They'll stay null in sensor_data until that hardware exists.

  if (gps.location.isValid()) {
    doc["latitude"]  = gps.location.lat();
    doc["longitude"] = gps.location.lng();
  }

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/sensor_data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SERVICE_ROLE_KEY);
  http.addHeader("Prefer", "return=minimal");
  int code = http.POST(payload);
  if (code <= 0) Serial.printf("sensor_data POST failed: %s\n", http.errorToString(code).c_str());
  http.end();

  patchRobotStatusOnline();
}

/* ============================================================
   robot_status — upsert online/state; also used generically
   to patch individual fields (pump, mode, irrigation, etc.)
   ============================================================ */
void patchRobotStatus(JsonDocument& fields) {
  String payload;
  serializeJson(fields, payload);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/robot_status?robot_id=eq." + ROBOT_ID);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SERVICE_ROLE_KEY);
  http.addHeader("Prefer", "return=minimal");
  http.sendRequest("PATCH", payload);
  http.end();
}

void patchRobotStatusOnline() {
  StaticJsonDocument<64> doc;
  doc["online"] = true;
  patchRobotStatus(doc);
}

/* ============================================================
   Commands — poll robot_commands for unexecuted rows,
   dispatch, mark executed
   ============================================================ */
void pollCommands() {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) +
             "/rest/v1/robot_commands?robot_id=eq." + ROBOT_ID +
             "&executed=eq.false&order=created_at.asc");
  http.addHeader("apikey", SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SERVICE_ROLE_KEY);

  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    DynamicJsonDocument doc(2048);
    if (deserializeJson(doc, body) == DeserializationError::Ok) {
      for (JsonObject cmd : doc.as<JsonArray>()) {
        long id = cmd["id"];
        String command = cmd["command"].as<String>();
        float value = cmd["value"].is<float>() ? cmd["value"].as<float>() : 0;
        handleCommand(command, value);
        markCommandExecuted(id);
      }
    }
  } else if (code > 0) {
    Serial.printf("robot_commands GET returned %d\n", code);
  }
  http.end();
}

void markCommandExecuted(long id) {
  StaticJsonDocument<64> doc;
  doc["executed"] = true;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/robot_commands?id=eq." + String(id));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SERVICE_ROLE_KEY);
  http.addHeader("Prefer", "return=minimal");
  http.sendRequest("PATCH", payload);
  http.end();
}

// Full command list per robot_commands_command_check in 0006_climate_control.sql
void handleCommand(const String& command, float value) {
  StaticJsonDocument<128> patch;

  if      (command == "forward")       driveForward();
  else if (command == "backward")      driveBackward();
  else if (command == "left")          turnLeft();
  else if (command == "right")         turnRight();
  else if (command == "stop")          driveStop();
  else if (command == "pump_on")       { pumpOn();  patch["pump_status"] = true; }
  else if (command == "pump_off")      { pumpOff(); patch["pump_status"] = false; }
  else if (command == "set_speed")     setSpeed((int)value);
  else if (command == "set_mode_auto")   patch["mode"] = "auto";
  else if (command == "set_mode_manual") patch["mode"] = "manual";
  else if (command == "heater_on")     { heaterOn();  patch["heater_status"] = true; }
  else if (command == "heater_off")    { heaterOff(); patch["heater_status"] = false; }
  else if (command == "cooler_on")     { coolerOn();  patch["cooler_status"] = true; }
  else if (command == "cooler_off")    { coolerOff(); patch["cooler_status"] = false; }
  else if (command == "vent_on")       { ventOn();  patch["vent_fan_status"] = true; }
  else if (command == "vent_off")      { ventOff(); patch["vent_fan_status"] = false; }
  else if (command == "set_irrigation_auto_on")  { irrigationAuto = true;  patch["irrigation_auto"] = true; }
  else if (command == "set_irrigation_auto_off") { irrigationAuto = false; patch["irrigation_auto"] = false; }
  else if (command == "set_irrigation_threshold") { irrigationThreshold = value; patch["irrigation_threshold"] = value; }
  else if (command == "set_ventilation_auto_on")  patch["ventilation_auto"] = true;
  else if (command == "set_ventilation_auto_off") patch["ventilation_auto"] = false;
  else if (command == "set_target_temp_min") patch["target_temp_min"] = value;
  else if (command == "set_target_temp_max") patch["target_temp_max"] = value;

  if (patch.size() > 0) patchRobotStatus(patch);
}

/* ============================================================
   Auto-mode logic — runs every sensor cycle
   ============================================================ */
void runAutoLogic() {
  if (irrigationAuto && readSoilMoisture() < irrigationThreshold) {
    pumpOn();
    StaticJsonDocument<64> doc;
    doc["pump_status"] = true;
    patchRobotStatus(doc);
  }
}

/* ============================================================
   Pin setup
   ============================================================ */
void setupActuatorPins() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  ledcSetup(PWM_CHANNEL_A, PWM_FREQ, PWM_RES_BITS);
  ledcAttachPin(ENA, PWM_CHANNEL_A);
  ledcSetup(PWM_CHANNEL_B, PWM_FREQ, PWM_RES_BITS);
  ledcAttachPin(ENB, PWM_CHANNEL_B);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);  // via voltage divider — see note above

  pinMode(PUMP_RELAY_PIN, OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, LOW); // relay off at boot

  // Heater/cooler/vent fan aren't in your parts list yet — these are
  // no-ops for now so handleCommand() doesn't crash if the dashboard
  // sends those commands. Wire real relays and fill these in later.
}

/* ============================================================
   Sensors
   ============================================================ */
float readSoilMoisture() {
  // Raw ADC (0-4095). Calibrate SOIL_DRY_RAW/SOIL_WET_RAW against
  // your actual sensor in air vs. in water before trusting this %.
  const int SOIL_DRY_RAW = 3000; // reading in dry air
  const int SOIL_WET_RAW = 1200; // reading fully submerged in water
  int raw = analogRead(SOIL_PIN);
  float percent = map(raw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  return constrain(percent, 0, 100);
}

float readTemperature() {
  float t = dht.readTemperature();
  return isnan(t) ? -1 : t; // -1 signals a failed read — check wiring if seen often
}

float readHumidity() {
  float h = dht.readHumidity();
  return isnan(h) ? -1 : h;
}

float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout (~5m range)
  if (duration == 0) return -1; // no echo received
  return duration * 0.0343 / 2.0; // cm
}

float readBatteryVoltage() {
  int raw = analogRead(BATTERY_PIN);
  float pinVoltage = (raw / 4095.0) * 3.3;
  return pinVoltage * VOLTAGE_DIVIDER_RATIO;
}

float readBatteryPercent() {
  // Rough linear estimate for 2x 18650 in series (7.4V nominal, 6.0V empty, 8.4V full).
  // Li-ion discharge isn't linear — treat this as approximate, not precise.
  float v = readBatteryVoltage();
  float percent = (v - 6.0) / (8.4 - 6.0) * 100.0;
  return constrain(percent, 0, 100);
}

/* ============================================================
   Drive (L298N — both motors on a side share one channel)
   ============================================================ */
void driveForward() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(PWM_CHANNEL_A, currentSpeed);
  ledcWrite(PWM_CHANNEL_B, currentSpeed);
}

void driveBackward() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  ledcWrite(PWM_CHANNEL_A, currentSpeed);
  ledcWrite(PWM_CHANNEL_B, currentSpeed);
}

void turnLeft() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);  // left side backward
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  // right side forward
  ledcWrite(PWM_CHANNEL_A, currentSpeed);
  ledcWrite(PWM_CHANNEL_B, currentSpeed);
}

void turnRight() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  // left side forward
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);  // right side backward
  ledcWrite(PWM_CHANNEL_A, currentSpeed);
  ledcWrite(PWM_CHANNEL_B, currentSpeed);
}

void driveStop() {
  ledcWrite(PWM_CHANNEL_A, 0);
  ledcWrite(PWM_CHANNEL_B, 0);
}

void setSpeed(int speed) {
  currentSpeed = constrain(speed, 0, 255);
}

/* ============================================================
   Pump (relay-driven, 12V)
   ============================================================ */
void pumpOn()  { digitalWrite(PUMP_RELAY_PIN, HIGH); }
void pumpOff() { digitalWrite(PUMP_RELAY_PIN, LOW); }

/* ============================================================
   Not in your current parts list — safe no-ops so handleCommand()
   doesn't break if these commands arrive from the dashboard.
   Wire real relays/actuators and replace these when you add them.
   ============================================================ */
void heaterOn()  {}
void heaterOff() {}
void coolerOn()  {}
void coolerOff() {}
void ventOn()    {}
void ventOff()   {}
