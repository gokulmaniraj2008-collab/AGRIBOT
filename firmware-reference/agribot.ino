/* ============================================================
   AgriBot ESP32 firmware
   Sensor telemetry + command polling + irrigation auto-mode,
   matched to supabase/migrations/0001_init.sql + 0006_climate_control.sql
   ============================================================ */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

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

  setupActuatorPins(); // define this in your existing pin-setup code
}

void loop() {
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

  // TODO: replace each with a real sensor read
  doc["soil_moisture"]       = readSoilMoisture();
  doc["temperature"]         = readTemperature();
  doc["humidity"]            = readHumidity();
  doc["distance_cm"]         = readUltrasonicDistance();
  doc["battery_voltage"]     = readBatteryVoltage();
  doc["battery_percent"]     = readBatteryPercent();
  doc["ph_level"]            = readPH();
  doc["nitrogen"]            = readNitrogen();
  doc["phosphorus"]          = readPhosphorus();
  doc["potassium"]           = readPotassium();
  doc["water_tank_percent"]  = readWaterTankPercent();
  // doc["latitude"]  / doc["longitude"] once GPS is wired in

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
   TODO — implement against your actual wiring:
   setupActuatorPins, readSoilMoisture, readTemperature, readHumidity,
   readUltrasonicDistance, readBatteryVoltage, readBatteryPercent,
   readPH, readNitrogen, readPhosphorus, readPotassium,
   readWaterTankPercent, driveForward/Backward/Stop, turnLeft/Right,
   setSpeed, pumpOn/Off, heaterOn/Off, coolerOn/Off, ventOn/Off
   ============================================================ */
