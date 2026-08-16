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
const unsigned long MS_PER_PLANT_STEP = 1500;   // legacy fallback only — no longer
                                                 // used for normal stepping now that
                                                 // patrol is ultrasonic-distance based
const unsigned long PATROL_SETTLE_MS = 500;
const float PATROL_OBSTACLE_STOP_CM = 15.0f;    // EMERGENCY stop distance — anything
                                                 // this close is treated as "in the way,"
                                                 // not "next plant found"

// --- Ultrasonic-based plant-to-plant stepping (replaces the old fixed-
// timer step). More accurate than a timer because it reacts to the
// actual next plant instead of assuming a distance — timer-based
// stepping drifts whenever speed/battery voltage changes; this doesn't.
// Two things you'll likely need to calibrate for your row:
//   PATROL_CLEARANCE_MS  - how long to drive blind before "looking" for
//                           the next plant, so it doesn't immediately
//                           re-detect the plant it just stopped at.
//                           Increase if it stops too early (barely moves).
//   PLANT_DETECT_CM       - how close the ultrasonic reading needs to
//                           get before it's treated as "found the next
//                           plant." Increase if it drives past plants
//                           without stopping; decrease if it stops too
//                           early on things that aren't the next plant.
const unsigned long PATROL_CLEARANCE_MS = 400;
const float PLANT_DETECT_CM = 25.0f;
const unsigned long PATROL_STEP_TIMEOUT_MS = 6000;  // give up looking for the
                                                     // next plant after this long
                                                     // (likely means it's missing,
                                                     // spacing is bigger than
                                                     // expected, or sensor issue)

// --- Expected-position gating (false-positive filter) ---
// The ultrasonic sensor cannot identify WHAT an object is — a rock, a
// stake, or a foot at PLANT_DETECT_CM looks identical to a real plant.
// GPS is too coarse (NEO-6M ~2.5-3m accuracy, see GPS_ARRIVE_RADIUS_M
// below) to gate individual plant positions when row spacing is smaller
// than that, so this uses elapsed time since PATROL_CLEARANCE_MS ended
// as a rough distance-traveled proxy instead: at roughly constant motor
// speed, a real next plant shouldn't be confirmed only a few
// milliseconds after clearance ends — that's more consistent with
// something sitting right next to the plant just left. This is NOT
// exact (speed drifts with battery voltage and terrain) — calibrate
// alongside PLANT_DETECT_CM using your actual row spacing and speed.
const unsigned long PLANT_MIN_STEP_MS = 800;  // minimum time after clearance
                                               // before a confirmation is
                                               // trusted as the next plant
                                               // rather than nearby clutter

// --- Camera-based plant classification (OFF by default) ---
// Ultrasonic alone cannot tell a plant from a rock/stake/foot at the
// same distance. When enabled, a plant confirmation triggers a photo
// request to the separate ESP32-CAM board (coordinated only through
// Supabase — there is no wired link between the two boards) before the
// robot commits to soil-check/watering.
// REQUIRES: (1) a DB migration adding "camera_check" to the
// robot_commands.command CHECK constraint, and (2) the updated
// esp32cam_supabase_upload.ino that polls for and answers that command.
// Until both exist, leave this false — the request will just sit
// unanswered and every check will time out (safe, but pointless).
const bool CAMERA_CHECK_ENABLED = false;
const unsigned long CAMERA_CHECK_TIMEOUT_MS = 6000;  // how long to wait for
                                                      // the ESP32-CAM's answer
                                                      // before FAILING OPEN
                                                      // (assuming it's a plant)
                                                      // rather than blocking
                                                      // patrol indefinitely
const int CAMERA_CHECK_MAX_RETRIES = 2;  // re-scan attempts if camera says
                                          // "not a plant" before giving up
                                          // and moving on as if timed out

// --- Patrol auto-watering ---
const float PATROL_WATER_THRESHOLD = 30.0f;     // below this soil %, water the plant
const unsigned long PATROL_WATER_MS = 3000;     // pump-on duration per plant — start
                                                 // estimate, calibrate to your pump's
                                                 // flow rate and pot/root size

// --- Soil-probe servo positions (activity-log feature) ---
// The probe servo was already attached in setup() (probeServo.write(0))
// but nothing previously moved it during a plant check — soil moisture
// was read with the probe wherever it happened to be. These angles make
// that movement explicit: DOWN before reading, UP before the robot
// drives again. Calibrate to your linkage/mount.
const int SERVO_SOIL_DOWN_ANGLE = 90;
const int SERVO_SOIL_UP_ANGLE = 0;
const unsigned long SERVO_MOVE_SETTLE_MS = 1000;  // time for the probe to
                                                   // physically settle into
                                                   // soil before reading it

// --- GPS go-to-plant navigation (PROTOTYPE — NEO-6M is only accurate to
// ~2.5-3m, so this gets the robot CLOSE to a saved spot, not exactly on
// top of it. Not a substitute for the ultrasonic-based patrol precision.) ---
const float GPS_ARRIVE_RADIUS_M = 2.0f;   // stop when within this many meters
const unsigned long GPS_NAV_TIMEOUT_MS = 60000;  // give up after 1 min so it
                                                  // can't wander forever if
                                                  // GPS drops or overshoots
const unsigned long GPS_DRIVE_PULSE_MS = 800;    // drive straight this long,
                                                  // then re-check position
const unsigned long GPS_TURN_PULSE_MS = 300;     // turn this long to correct
                                                  // heading before next pulse
const float GPS_HEADING_TOLERANCE_DEG = 20.0f;   // don't bother turning for
                                                  // errors smaller than this

// Result codes for a GPS navigation attempt, so callers (goToPlant,
// goToAndWaterAll) can react differently to "no saved spot" vs
// "arrived" vs "gave up" instead of only getting pushMessage text.
// Defined here near the top (not next to navigateToPlant()) because
// Arduino auto-generates function prototypes above the sketch body —
// if this enum were defined lower down, that auto-prototype for any
// function returning NavResult would reference an undeclared type.
enum NavResult { NAV_NO_LOCATION, NAV_NO_WIFI, NAV_LOST_GPS, NAV_OBSTACLE, NAV_TIMEOUT, NAV_ARRIVED };

// Result of one ultrasonic-based patrol step (see driveToNextPlant()
// below). Defined here for the same reason as NavResult above — Arduino
// auto-generates function prototypes before the sketch body, so any
// custom return type must already be declared by that point.
enum StepResult { STEP_PLANT_FOUND, STEP_OBSTACLE, STEP_TIMEOUT };

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

// Ultrasonic reading that satisfied the 3rd consecutive confirmation in
// driveToNextPlant(). Captured (not averaged, not hard-coded) so the
// patrol message can report the exact distance that triggered detection.
float lastConfirmedDist = -1;

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
  StaticJsonDocument<320> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["name"] = ROBOT_NAME;
  doc["online"] = true;
  doc["mode"] = currentMode;
  doc["pump_status"] = pumpStatus;
  doc["motor_state"] = motorState;
  doc["speed_value"] = speedValue;
  // Live GPS lock status, so the website can show a real-time
  // fix indicator instead of the user guessing whether it's safe
  // to tap Save Location.
  doc["gps_fix"] = gps.location.isValid();
  doc["gps_satellites"] = gps.satellites.isValid() ? gps.satellites.value() : 0;
  if (gps.location.isValid()) {
    doc["last_latitude"] = gps.location.lat();
    doc["last_longitude"] = gps.location.lng();
  }
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

// Drives forward toward the next plant using the ultrasonic sensor
// instead of a fixed timer, so it self-corrects regardless of motor
// speed or battery voltage. Two phases:
//   1. Clearance: drive blind for PATROL_CLEARANCE_MS so it doesn't
//      immediately "detect" the plant it's currently stopped at.
//   2. Detection: keep driving until something shows up within
//      PLANT_DETECT_CM (the next plant) or PATROL_STEP_TIMEOUT_MS
//      elapses (nothing found — likely a gap, missing plant, or the
//      row ended).
// Anything closer than PATROL_OBSTACLE_STOP_CM at any point is treated
// as an emergency stop, not a plant.
// Drives forward toward the next plant using the ultrasonic sensor
// instead of a fixed timer, so it self-corrects regardless of motor
// speed or battery voltage. Two phases:
//   1. Clearance: drive blind for PATROL_CLEARANCE_MS so it doesn't
//      immediately "detect" the plant it's currently stopped at.
//   2. Detection: keep driving until PLANT_DETECT_CM is seen on 3
//      CONSECUTIVE readings (not just one — a single close reading can
//      be a false echo off a leaf, dust, or sensor noise) or
//      PATROL_STEP_TIMEOUT_MS elapses with nothing confirmed.
// Anything closer than PATROL_OBSTACLE_STOP_CM at any point is treated
// as an emergency stop, not a plant — that check stays single-reading
// on purpose since safety stops can't wait for 3 confirmations.
// Logs every raw distance reading plus the final event (Plant Found /
// Obstacle / Timeout) to Serial for field calibration — see the
// PATROL_CLEARANCE_MS / PLANT_DETECT_CM comments above the constants
// for what to tune based on what you see in the Serial Monitor.
StepResult driveToNextPlant(int plantIndex) {
  digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);
  digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW);
  motorState = "forward";
  applySpeed();
  logEvent("ROBOT", "Moving forward", plantIndex);

  unsigned long lastLogMs = 0;
  float prevDist = -1;
  float prevPrevDist = -1;

  unsigned long clearStart = millis();
  while (millis() - clearStart < PATROL_CLEARANCE_MS) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    float dist = readUltrasonicCm();
    if (millis() - lastLogMs >= 150) {
      Serial.print("Distance: "); Serial.print(dist); Serial.println(" cm");
      lastLogMs = millis();
    }
    if (dist > 0 && dist < PATROL_OBSTACLE_STOP_CM) {
      stopMotors(); motorState = "stopped";
      Serial.println("Obstacle");
      logEvent("ROBOT", "STOPPED", plantIndex);
      return STEP_OBSTACLE;
    }
    delay(20);
  }

  unsigned long detectStart = millis();
  while (millis() - detectStart < PATROL_STEP_TIMEOUT_MS) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    float dist = readUltrasonicCm();
    if (millis() - lastLogMs >= 150) {
      Serial.print("Distance: "); Serial.print(dist); Serial.println(" cm");
      lastLogMs = millis();
    }

    if (dist > 0 && dist < PATROL_OBSTACLE_STOP_CM) {
      stopMotors(); motorState = "stopped";
      Serial.println("Obstacle");
      logEvent("ROBOT", "STOPPED", plantIndex);
      return STEP_OBSTACLE;
    }

    // Require 3 consecutive readings within PLANT_DETECT_CM before
    // committing to a stop — filters out single-frame false echoes.
    bool detectedNow = (dist > 0 && dist <= PLANT_DETECT_CM);
    bool detectedPrev = (prevDist > 0 && prevDist <= PLANT_DETECT_CM);
    bool detectedPrevPrev = (prevPrevDist > 0 && prevPrevDist <= PLANT_DETECT_CM);

    // Expected-position gate: even with 3 stable readings, ignore a
    // confirmation that arrives implausibly soon after clearance ended —
    // more likely to be clutter sitting right next to the plant just
    // left than the actual next plant at normal row spacing. Does NOT
    // apply to the emergency obstacle-stop check above, which must
    // always fire immediately for safety regardless of timing.
    bool plausibleSpacing = (millis() - detectStart) >= PLANT_MIN_STEP_MS;

    if (detectedNow && detectedPrev && detectedPrevPrev) {
      if (!plausibleSpacing) {
        Serial.println("Ignoring nearby object: too soon after clearance to be next plant");
        prevPrevDist = prevDist;
        prevDist = dist;
        delay(20);
        continue;
      }
      stopMotors(); motorState = "stopped";
      lastConfirmedDist = dist;
      Serial.println("Plant Found");
      logEvent("ROBOT", "STOPPED", plantIndex);
      logEvent("ULTRASONIC", "Plant detected", plantIndex, true, dist);
      return STEP_PLANT_FOUND;
    }

    prevPrevDist = prevDist;
    prevDist = dist;
    delay(20);
  }

  stopMotors(); motorState = "stopped";
  Serial.println("Timeout");
  logEvent("ROBOT", "STOPPED", plantIndex);
  return STEP_TIMEOUT;
}

// Drives to each plant in a row, stopping at each one to read soil
// moisture and push the result to Supabase.
void patrolRow(int numPlants) {
  if (numPlants <= 0) numPlants = 1;
  pushMessage("Patrol started: checking " + String(numPlants) + " plant(s)", "info");

  for (int plantIndex = 1; plantIndex <= numPlants; plantIndex++) {
    Serial.println("========== AGRIBOT EVENT ==========");
    StepResult result = driveToNextPlant(plantIndex);

    if (result == STEP_OBSTACLE) {
      pushMessage("Patrol stopped early: obstacle detected before plant " + String(plantIndex), "warning");
      return;
    }
    if (result == STEP_TIMEOUT) {
      pushMessage("Patrol stopped: couldn't find plant " + String(plantIndex) +
                  " within range — check spacing or PLANT_DETECT_CM calibration", "warning");
      return;
    }

    // Camera check runs BEFORE announcing "plant found" / saving GPS /
    // checking soil, so a false positive never gets logged or saved as
    // a real plant. If the camera says "not a plant," retry the scan
    // (up to CAMERA_CHECK_MAX_RETRIES) rather than immediately giving
    // up — the real next plant may just be a bit further out.
    int cameraAttempts = 0;
    while (!requestCameraCheck(plantIndex)) {
      cameraAttempts++;
      if (cameraAttempts > CAMERA_CHECK_MAX_RETRIES) {
        pushMessage("Patrol stopped: repeated non-plant object near plant " +
                    String(plantIndex) + " position — check row for obstructions", "warning");
        return;
      }
      result = driveToNextPlant(plantIndex);
      if (result == STEP_OBSTACLE) {
        pushMessage("Patrol stopped early: obstacle detected before plant " + String(plantIndex), "warning");
        return;
      }
      if (result == STEP_TIMEOUT) {
        pushMessage("Patrol stopped: couldn't find plant " + String(plantIndex) +
                    " within range — check spacing or PLANT_DETECT_CM calibration", "warning");
        return;
      }
    }

    pushMessage("Plant " + String(plantIndex) + " found (3 confirmed readings, " +
                String(lastConfirmedDist, 1) + " cm)", "info");
    delay(PATROL_SETTLE_MS);

    // Soil check + water first, then save the GPS fix for this plant —
    // matches the field log sequence (servo/soil/pump, then GPS, then
    // resume patrol). Safe to call even with no GPS fix —
    // savePlantLocation() checks gps.location.isValid() itself and just
    // logs a warning + returns.
    checkAndWaterHere(plantIndex);

    savePlantLocation(plantIndex);

    logEvent("ROBOT", "Continuing patrol...", plantIndex);
    Serial.println("==================================");
  }

  pushMessage("Patrol complete: " + String(numPlants) + " plant(s) checked", "success");
}

// Asks the ESP32-CAM (via Supabase, no direct link between the boards)
// to photograph and classify whatever the ultrasonic sensor just found.
// Returns true if it should be treated as a plant — including when the
// check is disabled, times out, or the request itself fails, so a
// camera problem can never silently block the whole patrol. Returns
// false ONLY on an explicit "not a plant" answer from the ESP32-CAM.
bool requestCameraCheck(int plantIndex) {
  if (!CAMERA_CHECK_ENABLED) return true;
  if (WiFi.status() != WL_CONNECTED) {
    pushMessage("Camera check skipped: no WiFi — trusting ultrasonic", "warning");
    return true;
  }

  logEvent("CAMERA", "Checking plant...", plantIndex);

  // 1. Ask the ESP32-CAM to capture + classify. This firmware only
  //    requests it must be matched by an updated esp32cam_supabase_upload.ino
  //    that polls robot_commands for "camera_check" and a DB migration
  //    adding that command to the CHECK constraint — see the
  //    CAMERA_CHECK_ENABLED comment above.
  StaticJsonDocument<128> reqDoc;
  reqDoc["robot_id"] = ROBOT_ID;
  reqDoc["command"] = "camera_check";
  reqDoc["value"] = plantIndex;
  String reqPayload; serializeJson(reqDoc, reqPayload);
  unsigned long requestedAt = millis();
  int reqCode = postJson(String(SUPABASE_URL) + "/rest/v1/robot_commands", reqPayload, false);
  if (reqCode < 200 || reqCode >= 300) {
    pushMessage("Camera check request failed (HTTP " + String(reqCode) + ") — trusting ultrasonic", "warning");
    return true;
  }

  // 2. Poll robot_images for the ESP32-CAM's answer. It writes the
  //    result into disease_status as "plant" or "not_plant" — a reuse
  //    of an existing unused column rather than a schema change, since
  //    that's the only field free-text enough to carry this signal.
  while (millis() - requestedAt < CAMERA_CHECK_TIMEOUT_MS) {
    String url = String(SUPABASE_URL) + "/rest/v1/robot_images?robot_id=eq." + ROBOT_ID +
                 "&plant_id=eq." + String(plantIndex) +
                 "&select=disease_status,captured_at&order=captured_at.desc&limit=1";
    HTTPClient http;
    if (http.begin(url)) {
      addHeaders(http);
      int code = http.GET();
      if (code == 200) {
        DynamicJsonDocument doc(256);
        if (!deserializeJson(doc, http.getString())) {
          JsonArray arr = doc.as<JsonArray>();
          if (arr.size() > 0) {
            String status = arr[0]["disease_status"] | "";
            http.end();
            if (status == "plant") {
              logEvent("CAMERA", "Result: PLANT", plantIndex);
              pushMessage("Camera check: confirmed plant " + String(plantIndex), "success");
              return true;
            }
            if (status == "not_plant") {
              logEvent("CAMERA", "Result: NOT_PLANT", plantIndex);
              pushMessage("Camera check: object at plant " + String(plantIndex) + " position is NOT a plant", "warning");
              return false;
            }
          }
        }
      }
    }
    http.end();
    delay(500);
  }

  logEvent("CAMERA", "Result: TIMEOUT (trusting ultrasonic)", plantIndex);
  pushMessage("Camera check timed out for plant " + String(plantIndex) + " — trusting ultrasonic", "warning");
  return true;
}

// Records the robot's current GPS fix as "plant N is here." Upserts so
// re-saving the same plant index overwrites the old spot.
void savePlantLocation(int plantIndex) {
  logEvent("GPS", "Saving plant location...", plantIndex);

  if (!gps.location.isValid()) {
    logEvent("GPS", "Location unavailable", plantIndex);
    pushMessage("Can't save plant " + String(plantIndex) + ": no GPS fix yet", "warning");
    return;
  }
  double lat = gps.location.lat();
  double lng = gps.location.lng();
  StaticJsonDocument<256> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["plant_index"] = plantIndex;
  doc["latitude"] = lat;
  doc["longitude"] = lng;
  String payload; serializeJson(doc, payload);
  String url = String(SUPABASE_URL) + "/rest/v1/plant_locations?on_conflict=robot_id,plant_index";
  int code = postJson(url, payload, true);
  if (code >= 200 && code < 300) {
    logEvent("GPS", "Location saved (" + String(lat, 6) + ", " + String(lng, 6) + ")", plantIndex);
    pushMessage("Saved plant " + String(plantIndex) + " location", "success");
  } else {
    logEvent("GPS", "Location save failed (HTTP " + String(code) + ")", plantIndex);
    pushMessage("Failed to save plant " + String(plantIndex) + " location (HTTP " + String(code) + ")", "warning");
  }
}

// PROTOTYPE navigation: drives in short straight pulses toward a saved
// plant's GPS spot, correcting heading between pulses using GPS
// course-over-ground (only reliable while actually moving — that's why
// this alternates short drive/turn pulses instead of steering
// continuously). Stops within GPS_ARRIVE_RADIUS_M — NOT exact-plant
// precision, see the constants block above for why.
// Core GPS navigation, split out of goToPlant() so it can be reused by
// both the single "goto_plant" command and the new patrol-by-GPS loop
// below. Does NOT push any messages itself (callers decide what to say);
// it only drives the robot and reports what happened.
NavResult navigateToPlant(int plantIndex) {
  if (WiFi.status() != WL_CONNECTED) return NAV_NO_WIFI;

  String url = String(SUPABASE_URL) + "/rest/v1/plant_locations?robot_id=eq." + ROBOT_ID +
               "&plant_index=eq." + String(plantIndex) + "&select=latitude,longitude&limit=1";
  HTTPClient http;
  if (!http.begin(url)) return NAV_NO_LOCATION;
  addHeaders(http);
  int code = http.GET();
  double targetLat = 0, targetLng = 0;
  bool found = false;
  if (code == 200) {
    DynamicJsonDocument doc(512);
    if (!deserializeJson(doc, http.getString())) {
      JsonArray arr = doc.as<JsonArray>();
      if (arr.size() > 0) {
        targetLat = arr[0]["latitude"] | 0.0;
        targetLng = arr[0]["longitude"] | 0.0;
        found = true;
      }
    }
  }
  http.end();

  if (!found) return NAV_NO_LOCATION;

  unsigned long navStart = millis();

  while (millis() - navStart < GPS_NAV_TIMEOUT_MS) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());

    if (!gps.location.isValid()) {
      stopMotors(); motorState = "stopped";
      return NAV_LOST_GPS;
    }

    double curLat = gps.location.lat();
    double curLng = gps.location.lng();
    double distanceM = TinyGPSPlus::distanceBetween(curLat, curLng, targetLat, targetLng);

    if (distanceM <= GPS_ARRIVE_RADIUS_M) {
      stopMotors(); motorState = "stopped";
      return NAV_ARRIVED;
    }

    double bearingToTarget = TinyGPSPlus::courseTo(curLat, curLng, targetLat, targetLng);

    // Drive a short pulse forward to get a fresh course-over-ground
    // reading (GPS can't report heading while stationary).
    digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);
    digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW);
    motorState = "forward"; applySpeed();
    unsigned long pulseStart = millis();
    bool obstacle = false;
    while (millis() - pulseStart < GPS_DRIVE_PULSE_MS) {
      while (gpsSerial.available()) gps.encode(gpsSerial.read());
      float dist = readUltrasonicCm();
      if (dist > 0 && dist < PATROL_OBSTACLE_STOP_CM) { obstacle = true; break; }
      delay(20);
    }
    stopMotors(); motorState = "stopped";

    if (obstacle) return NAV_OBSTACLE;

    if (gps.course.isValid() && gps.course.age() < 2000) {
      double heading = gps.course.deg();
      double headingError = bearingToTarget - heading;
      while (headingError > 180) headingError -= 360;
      while (headingError < -180) headingError += 360;

      if (abs(headingError) > GPS_HEADING_TOLERANCE_DEG) {
        if (headingError > 0) {
          digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);
          digitalWrite(IN3_PIN,LOW); digitalWrite(IN4_PIN,HIGH); motorState = "right";
        } else {
          digitalWrite(IN1_PIN,LOW); digitalWrite(IN2_PIN,HIGH);
          digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW); motorState = "left";
        }
        applySpeed();
        delay(GPS_TURN_PULSE_MS);
        stopMotors(); motorState = "stopped";
      }
    }
    // If course isn't valid/fresh yet, just drive another pulse straight
    // next loop — the next course reading will correct it.
  }

  stopMotors(); motorState = "stopped";
  return NAV_TIMEOUT;
}

// Wraps navigateToPlant() with the same status messages the old
// goToPlant() used to push, for the standalone "goto_plant" command.
void goToPlant(int plantIndex) {
  pushMessage("Heading to plant " + String(plantIndex), "info");
  NavResult result = navigateToPlant(plantIndex);
  switch (result) {
    case NAV_NO_WIFI:
      pushMessage("Can't go to plant " + String(plantIndex) + ": no WiFi", "warning"); break;
    case NAV_NO_LOCATION:
      pushMessage("No saved location for plant " + String(plantIndex), "warning"); break;
    case NAV_LOST_GPS:
      pushMessage("Lost GPS fix while navigating to plant " + String(plantIndex), "warning"); break;
    case NAV_OBSTACLE:
      pushMessage("Navigation stopped: obstacle near plant " + String(plantIndex), "warning"); break;
    case NAV_TIMEOUT:
      pushMessage("Gave up reaching plant " + String(plantIndex) + " after timeout", "warning"); break;
    case NAV_ARRIVED:
      pushMessage("Arrived near plant " + String(plantIndex), "success"); break;
  }
}

// Reads soil moisture at the current spot, pushes it to Supabase tagged
// with plantIndex, and waters if it's below PATROL_WATER_THRESHOLD.
// Shared by patrolRow() and goToAndWaterAll() so the check-and-water
// logic only lives in one place.
void checkAndWaterHere(int plantIndex) {
  // 1. Lower the soil probe. Logged with the exact angle so the servo's
  //    physical position is traceable from the log alone.
  probeServo.write(SERVO_SOIL_DOWN_ANGLE);
  logEvent("SERVO", "Soil probe DOWN", plantIndex, true, SERVO_SOIL_DOWN_ANGLE);

  // 2. Let it physically settle into the soil before trusting a reading.
  logEvent("SOIL", "Waiting for sensor...", plantIndex);
  delay(SERVO_MOVE_SETTLE_MS);

  // 3. Read the existing soil-moisture sensor (unchanged GPIO/logic —
  //    readSoilPercent() already lives above and is reused as-is).
  logEvent("SOIL", "Reading sensor...", plantIndex);
  int soilRaw = 0;
  float soilPercent = readSoilPercent(soilRaw);

  bool soilOk = !isnan(soilPercent);
  if (soilOk) {
    logEvent("SOIL", "Raw value: " + String(soilRaw), plantIndex, true, soilRaw);
    logEvent("SOIL", "Moisture: " + String(soilPercent, 0) + "%", plantIndex, true, soilPercent);
    logEvent("SOIL", soilPercent < PATROL_WATER_THRESHOLD ? "Status: DRY" : "Status: WET", plantIndex);
  } else {
    logEvent("SOIL", "ERROR: Sensor reading failed", plantIndex);
  }

  // 4. Raise the probe again BEFORE the robot moves — this must happen
  //    on every path (success, dry, wet, or sensor error) so the probe
  //    is never left down when driveToNextPlant() drives off next.
  probeServo.write(SERVO_SOIL_UP_ANGLE);
  logEvent("SERVO", "Soil probe UP", plantIndex, true, SERVO_SOIL_UP_ANGLE);

  if (!soilOk) {
    pushMessage("Plant " + String(plantIndex) + ": soil sensor reading failed", "warning");
    return;  // Never auto-water on a failed/unavailable reading.
  }

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

  // 5. Water ONLY here — after a confirmed plant AND a successful soil
  //    reading below threshold. Ultrasonic detection alone never
  //    reaches this point (camera check + this soil read both gate it).
  if (soilPercent < PATROL_WATER_THRESHOLD) {
    logEvent("PUMP", "Soil is dry", plantIndex);
    pushMessage("Plant " + String(plantIndex) + " is dry (" + String(soilPercent, 0) +
                "%) — watering for " + String(PATROL_WATER_MS / 1000) + "s", "warning");

    digitalWrite(RELAY_PIN, HIGH); digitalWrite(LED_PUMP_PIN, HIGH); pumpStatus = true;
    logEvent("PUMP", "ON", plantIndex);
    logEvent("PUMP", "Watering started", plantIndex);
    pushRobotStatus();
    delay(PATROL_WATER_MS);
    digitalWrite(RELAY_PIN, LOW); digitalWrite(LED_PUMP_PIN, LOW); pumpStatus = false;
    logEvent("PUMP", "Watering completed", plantIndex);
    logEvent("PUMP", "OFF", plantIndex);
    pushRobotStatus();

    pushMessage("Plant " + String(plantIndex) + ": watering done", "success");
  } else {
    logEvent("PUMP", "Soil moisture sufficient", plantIndex);
    logEvent("PUMP", "OFF", plantIndex);
    logEvent("PUMP", "Watering not required", plantIndex);
  }
}

// GPS version of patrolRow(): for each saved plant index 1..numPlants,
// navigate there via saved GPS coordinates, then check soil moisture
// and auto-water if dry, then move on to the next plant. This is the
// "go to saved location -> check moisture -> water if low -> next
// plant" flow.
void goToAndWaterAll(int numPlants) {
  if (numPlants <= 0) numPlants = 1;
  pushMessage("GPS patrol started: visiting " + String(numPlants) + " saved plant(s)", "info");

  for (int plantIndex = 1; plantIndex <= numPlants; plantIndex++) {
    pushMessage("Heading to plant " + String(plantIndex), "info");
    NavResult result = navigateToPlant(plantIndex);

    switch (result) {
      case NAV_NO_WIFI:
        pushMessage("GPS patrol stopped: no WiFi", "warning");
        return;
      case NAV_NO_LOCATION:
        pushMessage("Skipping plant " + String(plantIndex) + ": no saved location", "warning");
        continue;
      case NAV_LOST_GPS:
        pushMessage("GPS patrol stopped: lost GPS fix before plant " + String(plantIndex), "warning");
        return;
      case NAV_OBSTACLE:
        pushMessage("GPS patrol stopped: obstacle near plant " + String(plantIndex), "warning");
        return;
      case NAV_TIMEOUT:
        pushMessage("Skipping plant " + String(plantIndex) + ": timed out reaching it", "warning");
        continue;
      case NAV_ARRIVED:
        pushMessage("Arrived near plant " + String(plantIndex), "success");
        break;
    }

    delay(PATROL_SETTLE_MS);
    checkAndWaterHere(plantIndex);
  }

  pushMessage("GPS patrol complete: " + String(numPlants) + " plant(s) visited", "success");
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
  } else if (command == "save_plant_location") {
    savePlantLocation(value > 0 ? value : 1);
  } else if (command == "goto_plant") {
    goToPlant(value > 0 ? value : 1);
  } else if (command == "goto_and_water_all") {
    goToAndWaterAll(value > 0 ? value : 1);
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

// ------------------------------------------------------------------
// Activity logging (robot_logs) — structured, per-step event log for
// the detect -> verify -> probe -> water -> save sequence, separate
// from pushMessage()'s free-text device_messages feed. Two outputs:
//   1. Serial, formatted as [HH:MM:SS] [COMPONENT] message
//      (HH:MM:SS is elapsed time since boot — this board has no RTC/NTP
//      time sync, so it is NOT wall-clock time; swap in a real clock
//      source here if you add one later).
//   2. Supabase robot_logs, one row per event, best-effort — same
//      fire-and-forget synchronous POST pattern as pushMessage() /
//      pushSensorData() elsewhere in this file (postJson has its own
//      8s timeout, so a slow/absent connection delays but never hangs
//      this call forever). If WiFi is down the event still prints to
//      Serial and the function returns immediately.
String elapsedTimestamp() {
  unsigned long s = millis() / 1000;
  int hh = (s / 3600) % 24;
  int mm = (s / 60) % 60;
  int ss = s % 60;
  char buf[10];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d", hh, mm, ss);
  return String(buf);
}

void logEvent(const String& component, const String& message, int plantIndex, bool hasValue, float value) {
  Serial.printf("[%s] [%s] %s\n", elapsedTimestamp().c_str(), component.c_str(), message.c_str());

  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<384> doc;
  doc["robot_id"] = ROBOT_ID;
  if (plantIndex > 0) doc["plant_id"] = plantIndex;
  doc["event_type"] = component;
  doc["message"] = message;
  if (hasValue) doc["value"] = value;
  String payload; serializeJson(doc, payload);
  postJson(String(SUPABASE_URL) + "/rest/v1/robot_logs", payload, false);
}

// Convenience overload for events with no numeric value (e.g. "STOPPED").
void logEvent(const String& component, const String& message, int plantIndex) {
  logEvent(component, message, plantIndex, false, 0);
}

void pushMessage(const String& message, const String& level) {
  Serial.printf("[robot say] (%s) %s\n", level.c_str(), message.c_str());
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
        Serial.printf("[website say] %s\n", text.c_str());

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
