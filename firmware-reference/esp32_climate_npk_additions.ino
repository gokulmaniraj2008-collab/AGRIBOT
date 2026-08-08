/* ============================================================
   AgriBot ESP32 — Additions for pH / NPK / Water Tank sensors
   and Climate / Irrigation / Ventilation actuator control.

   This is a REFERENCE snippet to merge into your existing
   ESP32 sketch — it assumes you already have:
     - WiFi connected
     - Supabase project URL + service_role key as constants
     - An existing loop that POSTs sensor_data and reads
       robot_commands (per your dashboard's api/commands route)
   ============================================================ */

#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---- Existing constants (already in your sketch) ----
const char* SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const char* SERVICE_ROLE_KEY = "YOUR_SERVICE_ROLE_KEY"; // device-only, never in the web app
const char* ROBOT_ID = "agribot-01";

// ---- New pin assignments (adjust to your wiring) ----
const int PH_SENSOR_PIN       = 34; // analog pH probe
const int NPK_SENSOR_RX       = 16; // NPK sensor (RS485/UART, e.g. JXBS-3001-NPK)
const int NPK_SENSOR_TX       = 17;
const int WATER_TANK_TRIG_PIN = 25; // ultrasonic sensor on tank
const int WATER_TANK_ECHO_PIN = 26;

const int HEATER_RELAY_PIN    = 27;
const int COOLER_RELAY_PIN    = 14;
const int VENT_FAN_RELAY_PIN  = 12;

void setupActuatorPins() {
  pinMode(HEATER_RELAY_PIN, OUTPUT);
  pinMode(COOLER_RELAY_PIN, OUTPUT);
  pinMode(VENT_FAN_RELAY_PIN, OUTPUT);
  digitalWrite(HEATER_RELAY_PIN, LOW);
  digitalWrite(COOLER_RELAY_PIN, LOW);
  digitalWrite(VENT_FAN_RELAY_PIN, LOW);
}

// ---- Reading the new sensors ----

float readPhLevel() {
  int raw = analogRead(PH_SENSOR_PIN);
  float voltage = raw * (3.3 / 4095.0);
  // Calibrate with pH 4.0 and 7.0 buffer solutions for your probe.
  // Placeholder linear formula — replace slope/offset after calibration.
  float ph = 7.0 - ((voltage - 2.5) / 0.18);
  return ph;
}

// NPK sensors are usually RS485 Modbus — this is a stub showing the
// shape of the read; use a library like ModbusMaster for the real call.
struct NpkReading { float n, p, k; };

NpkReading readNpk() {
  NpkReading r;
  // Replace with actual Modbus register read (registers 0x001E, 0x001F, 0x0020
  // are typical for JXBS-3001-NPK, but confirm against your sensor's datasheet).
  r.n = 0; r.p = 0; r.k = 0;
  return r;
}

float readWaterTankPercent(float tankHeightCm) {
  digitalWrite(WATER_TANK_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(WATER_TANK_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(WATER_TANK_TRIG_PIN, LOW);
  long duration = pulseIn(WATER_TANK_ECHO_PIN, HIGH, 30000);
  float distanceCm = duration * 0.0343 / 2.0;
  float fullDistance = 5.0;       // distance sensor-to-water when tank is full
  float emptyDistance = tankHeightCm; // distance sensor-to-bottom when empty
  float percent = 100.0 * (emptyDistance - distanceCm) / (emptyDistance - fullDistance);
  return constrain(percent, 0, 100);
}

// ---- Extend your existing sensor_data POST payload ----

void postSensorData(float soilMoisture, float temperature, float humidity,
                     float distanceCm, float batteryVoltage, float batteryPercent,
                     double lat, double lng) {
  float ph = readPhLevel();
  NpkReading npk = readNpk();
  float waterTank = readWaterTankPercent(30.0); // pass your actual tank height in cm

  StaticJsonDocument<512> doc;
  doc["soil_moisture"] = soilMoisture;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["distance_cm"] = distanceCm;
  doc["battery_voltage"] = batteryVoltage;
  doc["battery_percent"] = batteryPercent;
  doc["latitude"] = lat;
  doc["longitude"] = lng;
  // New fields matching migration 0006_climate_control.sql:
  doc["ph_level"] = ph;
  doc["nitrogen"] = npk.n;
  doc["phosphorus"] = npk.p;
  doc["potassium"] = npk.k;
  doc["water_tank_percent"] = waterTank;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/sensor_data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SERVICE_ROLE_KEY);
  http.addHeader("Prefer", "return=minimal");
  http.POST(payload);
  http.end();
}

// ---- Update robot_status with actuator state ----

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

// ---- Handle the new commands (add to your existing command switch) ----
// Your existing loop already polls robot_commands for pending rows and
// marks them executed — add these cases alongside forward/pump_on/etc.

void handleCommand(const String& command, float value) {
  StaticJsonDocument<128> patch;

  if (command == "heater_on")  { digitalWrite(HEATER_RELAY_PIN, HIGH); patch["heater_status"] = true; }
  else if (command == "heater_off") { digitalWrite(HEATER_RELAY_PIN, LOW); patch["heater_status"] = false; }

  else if (command == "cooler_on")  { digitalWrite(COOLER_RELAY_PIN, HIGH); patch["cooler_status"] = true; }
  else if (command == "cooler_off") { digitalWrite(COOLER_RELAY_PIN, LOW); patch["cooler_status"] = false; }

  else if (command == "vent_on")  { digitalWrite(VENT_FAN_RELAY_PIN, HIGH); patch["vent_fan_status"] = true; }
  else if (command == "vent_off") { digitalWrite(VENT_FAN_RELAY_PIN, LOW); patch["vent_fan_status"] = false; }

  else if (command == "set_irrigation_auto_on")  patch["irrigation_auto"] = true;
  else if (command == "set_irrigation_auto_off") patch["irrigation_auto"] = false;
  else if (command == "set_irrigation_threshold") patch["irrigation_threshold"] = value;

  else if (command == "set_ventilation_auto_on")  patch["ventilation_auto"] = true;
  else if (command == "set_ventilation_auto_off") patch["ventilation_auto"] = false;

  else if (command == "set_target_temp_min") patch["target_temp_min"] = value;
  else if (command == "set_target_temp_max") patch["target_temp_max"] = value;

  else return; // not one of the new commands — fall through to your existing handler

  if (patch.size() > 0) patchRobotStatus(patch);
}

/* ============================================================
   Auto-mode logic (optional) — run this every sensor cycle if
   irrigation_auto / ventilation_auto are true, so the robot
   reacts without waiting for a dashboard command.
   ============================================================ */

void runAutoLogic(float soilMoisture, float temperature,
                   bool irrigationAuto, float irrigationThreshold,
                   bool ventilationAuto, float targetTempMax) {
  if (irrigationAuto && soilMoisture < irrigationThreshold) {
    // trigger pump the same way pump_on does
  }
  if (ventilationAuto && temperature > targetTempMax) {
    digitalWrite(VENT_FAN_RELAY_PIN, HIGH);
  } else if (ventilationAuto) {
    digitalWrite(VENT_FAN_RELAY_PIN, LOW);
  }
}
