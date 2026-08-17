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
#include "esp_system.h"  // for esp_reset_reason() — boot-loop guard below

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

// --- Ultrasonic hardware-failure detection ---
// readUltrasonicCm() returns -1 both when nothing is in range yet AND
// when the sensor is disconnected/dead (no echo pulse at all) — a
// single -1 can't tell those apart. Unlike PATROL_STEP_TIMEOUT_MS
// above (sensor working, no plant found), this counts CONSECUTIVE -1
// readings while driving: a working sensor in a normal row/greenhouse
// environment should pick up *something* (the next plant, a wall,
// ground multipath) well before this many readings in a row come back
// empty, so a sustained streak is treated as the sensor not
// responding at all rather than open space ahead.
const int ULTRASONIC_FAIL_STREAK = 15;  // ~0.5-1s of sustained silence at the
                                         // ~20-30ms per-reading loop rate below.
                                         // Lower for faster failure detection;
                                         // raise if unusually open rows are
                                         // causing false ULTRASONIC ERROR trips.

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

// --- Camera-based plant classification (auto-detected at runtime) ---
// Ultrasonic alone cannot tell a plant from a rock/stake/foot at the
// same distance. At each stop the robot now asks Supabase whether the
// ESP32-CAM is currently online (no wired link between the two boards —
// this is the only way to know it's present) and picks the workflow
// automatically:
//   CAMERA ONLINE                 -> photo + classify, gate on the result
//   CAMERA OFFLINE                -> skip verification, go straight to soil check
//   CAMERA ONLINE + "not a plant" -> genuine rejection, retry the scan
//
// Status (verified 2026-08-16 against the live DB and the fixed
// esp32cam_supabase_upload.ino — see that file's header for details):
//   1. "camera_check" is now in the robot_commands.command CHECK
//      constraint — requests from this board no longer get rejected.
//   2. The fixed CAM firmware heartbeats into robot_status under
//      CAM_ROBOT_ID below on its own HEARTBEAT_INTERVAL_MS, and fixed
//      its robot_images.storage_path bug (was hard-coded to "", which
//      is UNIQUE NOT NULL in the DB — broke every classification after
//      the first one).
//   3. isCameraOnline() below calls the public.is_camera_online() RPC
//      instead of reading the "online" column directly — that RPC
//      checks BOTH online=true AND updated_at freshness server-side
//      (via Postgres's own now(), see CAMERA_HEARTBEAT_MAX_AGE_S),
//      since this board has no RTC/NTP and can't safely judge a
//      timestamp's age itself.
// Still untested end-to-end on real hardware as of this comment — test
// heartbeat, then camera_check, then several repeated classifications
// in a row, before trusting this in an unattended AUTO run.
const char* CAM_ROBOT_ID = "agribot-01-cam";  // robot_id the ESP32-CAM
                                               // heartbeats under in
                                               // robot_status. Must match
                                               // CAM_ROBOT_ID in
                                               // esp32cam_supabase_upload.ino
                                               // exactly.
const int CAMERA_HEARTBEAT_MAX_AGE_S = 15;    // a heartbeat older than this
                                               // (by Postgres's own clock) is
                                               // treated as offline, even if
                                               // the "online" column still
                                               // says true — catches a camera
                                               // that lost power/WiFi without
                                               // a clean disconnect to flip
                                               // the flag itself. Kept at 3x
                                               // the CAM's own
                                               // HEARTBEAT_INTERVAL_MS (5000ms)
                                               // so ordinary network jitter
                                               // doesn't flap this false.
// Manual kill-switch for testing/debugging only — leave false. When
// true, camera use is forced off regardless of what isCameraOnline()
// reports, without touching the detection logic itself.
const bool CAMERA_CHECK_FORCE_DISABLE = false;
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

// --- AUTO mode: continuous autonomous controller ---
// AUTO is a separate concept from a single patrol_row command: turning
// AUTO on repeatedly runs full patrol cycles (see runAutoPatrolCycle())
// back-to-back — driven by loop() calling it again on every pass while
// autoModeActive is true — until AUTO is turned off (by command) or a
// cycle hits a condition serious enough to require a person's attention.
const int AUTO_PATROL_DEFAULT_PLANTS = 5;         // used only if set_mode_auto
                                                   // arrives with no value —
                                                   // normally the website sends
                                                   // its current patrol-count
                                                   // setting as the value.
const unsigned long AUTO_CYCLE_SETTLE_MS = 2000;  // pause between AUTO cycles,
                                                   // separate from PATROL_SETTLE_MS
                                                   // (that one is per-plant, this
                                                   // is per full lap of the row)
const int AUTO_GATE_PING_ATTEMPTS = 5;            // ultrasonic pings tried at the
const unsigned long AUTO_GATE_PING_DELAY_MS = 30; // AUTO start gate — same shape
                                                   // as systemSelfCheck()'s boot
                                                   // check, but this one BLOCKS
                                                   // AUTO from starting on failure
                                                   // instead of just logging it.

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
enum StepResult { STEP_PLANT_FOUND, STEP_OBSTACLE, STEP_TIMEOUT, STEP_SENSOR_ERROR };

// Outcome of one full patrolRow() lap, used by runAutoPatrolCycle() to
// decide whether AUTO should immediately run another lap or stop and
// fall back to manual so a person can look at the robot. Defined here
// for the same auto-prototype reason as StepResult/NavResult above.
enum PatrolResult { PATROL_COMPLETE, PATROL_OBSTACLE, PATROL_TIMEOUT, PATROL_CAMERA_BLOCKED, PATROL_HARDWARE_ERROR, PATROL_SAFETY_STOP, PATROL_CANCELLED };

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

// AUTO mode state. autoModeActive is the thing loop() actually checks
// each pass to decide whether to run another patrol cycle — kept
// separate from currentMode (a display string synced to Supabase) so
// the two can never drift: every place that changes one changes both
// in the same breath.
bool autoModeActive = false;
int autoPatrolPlantCount = AUTO_PATROL_DEFAULT_PLANTS;

// Ultrasonic reading that satisfied the 3rd consecutive confirmation in
// driveToNextPlant(). Captured (not averaged, not hard-coded) so the
// patrol message can report the exact distance that triggered detection.
float lastConfirmedDist = -1;

// --- Plant Mission System state ---
// id of the missions row currently in progress, or -1 when no mission
// is running. Mirrored into robot_status.current_mission_id by
// pushRobotStatus() so the dashboard always reflects what this board
// believes is happening, not a stale guess.
long currentMissionId = -1;

// Set by checkAndWaterHere() before every return, same pattern as
// lastConfirmedDist above — lets patrolRow() report what actually
// happened (soil value / watered / duration) into mission_plants
// without changing checkAndWaterHere()'s existing bool return type or
// its other caller (goToAndWaterAll()).
float lastSoilMoisture = NAN;
bool lastSoilOk = false;
bool lastWatered = false;
float lastWaterDurationS = 0;

// --- Safety supervisor ---
// Latched by reportSafetyFault() on any condition serious enough to
// require a person's attention (hardware failure, critical battery).
// While true: AUTO refuses to (re)start and patrolRow() refuses to
// begin a new mission, even via a manual patrol_row/start_mission
// command — only an explicit safety_reset command (or reboot) clears
// it. This is deliberately stricter than the existing per-lap halts
// (haltForSensorError etc.), which already stop the CURRENT lap but
// previously left the door open for the next command to just try
// again immediately.
bool safetyStopped = false;
const float BATTERY_CRITICAL_PERCENT = 8.0f;  // below this, block new
                                               // missions/AUTO starts —
                                               // separate from the 15%
                                               // low-battery WARNING in
                                               // pushSensorData(), which
                                               // only notifies and never
                                               // blocks anything.

// --- Boot-loop guard ---
// RTC_DATA_ATTR survives a brownout/software reset (unlike normal
// globals, which are reinitialized to 0 on every boot) — it's only
// cleared by a genuine power-off. This is what lets us tell "this is
// the Nth crash in a row" apart from "this is a normal fresh power-on."
// Without this, a crash-inducing command (like a motor command that
// browns out the board) gets retried identically forever, since each
// reboot has no memory of the previous attempt having failed.
RTC_DATA_ATTR int crashBootCount = 0;
const int MAX_CRASH_BOOTS = 3;  // after this many bad reboots in a row,
                                 // stop retrying and latch safety-stop
                                 // instead — see checkBootLoop() in setup().

// Cancels every currently-pending command for this robot. Used by the
// boot-loop guard so a poison-pill command (one that reliably crashes
// the board) doesn't just sit there getting retried by every future
// boot too — same effect as the manual queue-clear you'd otherwise
// have to do by hand.
void clearStuckCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?robot_id=eq." + ROBOT_ID + "&executed=eq.false";
  HTTPClient http;
  if (!http.begin(url)) return;
  addHeaders(http);
  http.addHeader("Prefer", "return=minimal");
  http.PATCH("{\"executed\":true}");
  http.end();
}

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
  StaticJsonDocument<384> doc;  // bumped from 320 for current_mission_id + safety_stopped
  doc["robot_id"] = ROBOT_ID;
  doc["name"] = ROBOT_NAME;
  doc["online"] = true;
  doc["mode"] = currentMode;
  doc["pump_status"] = pumpStatus;
  doc["motor_state"] = motorState;
  doc["speed_value"] = speedValue;
  // Plant Mission System: which mission (if any) this board believes
  // is currently running, and whether the safety supervisor has
  // latched a fault. null/false are valid, meaningful states here —
  // always sent, not just when non-default — so a mission that just
  // ended is reflected within one heartbeat, not left stale.
  if (currentMissionId >= 0) doc["current_mission_id"] = currentMissionId;
  else doc["current_mission_id"] = nullptr;
  doc["safety_stopped"] = safetyStopped;
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

// Tracks what ENA/ENB are actually set to right now, so applySpeed()'s
// ramp starts from the real current value — including after
// stopMotors() forces them to 0 directly (see below), which would
// otherwise leave these stale and make the next ramp start from the
// wrong point.
int currentPwmA = 0, currentPwmB = 0;

void stopMotors() {
  digitalWrite(IN1_PIN, LOW); digitalWrite(IN2_PIN, LOW);
  digitalWrite(IN3_PIN, LOW); digitalWrite(IN4_PIN, LOW);
  analogWrite(ENA_PIN, 0); analogWrite(ENB_PIN, 0);
  currentPwmA = 0; currentPwmB = 0;
}

// Ramps ENA/ENB up to speedValue in small steps instead of jumping
// straight there. This does NOT fix an undervoltage-caused brownout —
// that's a hardware problem (see the accompanying capacitor/battery
// notes) — but a sudden 0->255 PWM jump asks the motors for their
// highest instantaneous current draw right at the moment the driver
// enables them, which is the worst possible time for it. Ramping
// spreads that draw over ~150ms, which can be enough on its own to
// keep the rail from dipping past the brownout threshold, especially
// for motor starts that would otherwise have JUST missed triggering
// one.
void applySpeed() {
  int step = 15;             // PWM counts per ramp tick
  int delayPerStepMs = 6;    // ~150ms total for a 0->255 ramp
  while (currentPwmA != speedValue || currentPwmB != speedValue) {
    if (currentPwmA < speedValue) currentPwmA = min(currentPwmA + step, speedValue);
    else if (currentPwmA > speedValue) currentPwmA = max(currentPwmA - step, speedValue);
    if (currentPwmB < speedValue) currentPwmB = min(currentPwmB + step, speedValue);
    else if (currentPwmB > speedValue) currentPwmB = max(currentPwmB - step, speedValue);
    analogWrite(ENA_PIN, currentPwmA);
    analogWrite(ENB_PIN, currentPwmB);
    delay(delayPerStepMs);
  }
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
// Stops the robot and reports the ultrasonic sensor as not responding.
// Distinct from STEP_TIMEOUT (sensor working fine, just nothing found
// within PATROL_STEP_TIMEOUT_MS) — this fires only after a sustained
// streak of no-echo readings (see ULTRASONIC_FAIL_STREAK). Unlike the
// camera, the ultrasonic sensor is what tells the robot WHERE to stop
// for soil-check/watering, so a dead sensor is never auto-skipped:
// continuing blind risks probing/pumping at the wrong spot, or the
// right spot never getting checked at all. Callers (driveToNextPlant's
// two loops) return this immediately instead of letting the robot keep
// driving blind toward PATROL_STEP_TIMEOUT_MS.
StepResult ultrasonicSensorFailure(int plantIndex) {
  stopMotors(); motorState = "stopped";
  Serial.println("Ultrasonic sensor not responding");
  logEvent("ULTRASONIC", "ERROR: No response", plantIndex);
  logEvent("ULTRASONIC", "Sensor unavailable", plantIndex);
  logEvent("ROBOT", "STOPPED", plantIndex);
  return STEP_SENSOR_ERROR;
}

StepResult driveToNextPlant(int plantIndex) {
  logEvent("ULTRASONIC", "Checking sensor...", plantIndex);

  digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);
  digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW);
  motorState = "forward";
  applySpeed();
  logEvent("ROBOT", "Moving forward", plantIndex);

  unsigned long lastLogMs = 0;
  float prevDist = -1;
  float prevPrevDist = -1;
  int noEchoStreak = 0;

  unsigned long clearStart = millis();
  while (millis() - clearStart < PATROL_CLEARANCE_MS) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    float dist = readUltrasonicCm();
    if (millis() - lastLogMs >= 150) {
      Serial.print("Distance: "); Serial.print(dist); Serial.println(" cm");
      lastLogMs = millis();
    }
    if (dist > 0) {
      noEchoStreak = 0;
    } else if (++noEchoStreak >= ULTRASONIC_FAIL_STREAK) {
      return ultrasonicSensorFailure(plantIndex);
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

    if (dist > 0) {
      noEchoStreak = 0;
    } else if (++noEchoStreak >= ULTRASONIC_FAIL_STREAK) {
      return ultrasonicSensorFailure(plantIndex);
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
      // Log all 3 confirming readings individually (not just the final
      // one) so the field log shows exactly what triggered the stop —
      // useful when calibrating PLANT_DETECT_CM against real noise.
      logEvent("ULTRASONIC", "Reading 1: " + String(prevPrevDist, 0) + " cm", plantIndex, true, prevPrevDist);
      logEvent("ULTRASONIC", "Reading 2: " + String(prevDist, 0) + " cm", plantIndex, true, prevDist);
      logEvent("ULTRASONIC", "Reading 3: " + String(dist, 0) + " cm", plantIndex, true, dist);
      logEvent("ULTRASONIC", "Object confirmed", plantIndex);
      logEvent("ROBOT", "STOPPED", plantIndex);
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

// Ultrasonic hardware failure during patrol: unlike a camera dropout,
// this is never auto-skipped. The robot stops where it is, the
// soil-probe servo and pump are explicitly SKIPPED (not just "not yet
// reached"), no GPS fix is saved for this plant since its position was
// never actually confirmed, and the whole patrol halts rather than
// moving on to the next plant blind. Logged in the exact sequence
// requested: ROBOT STOPPED / SERVO SKIPPED / PUMP SKIPPED / GPS none /
// ROBOT waiting — so the field log makes it obvious this needs a
// person to check the TRIG/ECHO wiring before resuming, not just a
// retry.
void haltForSensorError(int plantIndex) {
  logEvent("SERVO", "SKIPPED", plantIndex);
  logEvent("PUMP", "SKIPPED", plantIndex);
  logEvent("GPS", "No plant location saved", plantIndex);
  logEvent("ROBOT", "Waiting for ultrasonic sensor", plantIndex);
  pushMessage("Patrol stopped: ultrasonic sensor not responding at plant " +
              String(plantIndex) + " — check TRIG/ECHO wiring and power before resuming",
              "warning");
}

// Drives to each plant in a row, stopping at each one to read soil
// moisture and push the result to Supabase. Returns why the lap ended
// so callers — the manual "patrol_row" command AND runAutoPatrolCycle()
// — can each decide what to do next; patrolRow() itself doesn't know or
// care whether it was called manually or by AUTO.
PatrolResult patrolRow(int numPlants) {
  if (numPlants <= 0) numPlants = 1;

  // Safety supervisor: refuse to even START a mission with a latched
  // fault, whether this call came from a manual patrol_row/
  // start_mission command or from AUTO. Only safety_reset clears this.
  if (!checkSafety()) {
    pushMessage("Patrol blocked: safety supervisor has a latched fault — send safety_reset first", "warning");
    return PATROL_SAFETY_STOP;
  }

  // Every patrol run — manual or AUTO — is now a Mission. missionId
  // stays -1 (mission tracking unavailable, e.g. no WiFi at the exact
  // moment of the POST) rather than aborting the lap over it; the
  // patrol itself must never depend on the tracking layer succeeding.
  long missionId = createMission(numPlants);
  currentMissionId = missionId;
  pushRobotStatus();
  logEvent("MISSION", missionId >= 0 ? ("Mission #" + String(missionId) + " started") :
                                        "WARNING: mission tracking unavailable — running untracked", 0);

  pushMessage("Patrol started: checking " + String(numPlants) + " plant(s)", "info");

  for (int plantIndex = 1; plantIndex <= numPlants; plantIndex++) {
    Serial.println("========== AGRIBOT EVENT ==========");

    // Re-checked every plant, not just at mission start — a fault
    // (e.g. battery draining below the critical floor) can develop
    // mid-mission, and cancellation can only be observed between
    // blocking steps like this one (see cancelRequested()'s comment).
    if (!checkSafety()) {
      pushMessage("Patrol stopped: safety supervisor triggered mid-mission", "warning");
      failPatrolStep(missionId, plantIndex, "failed", "failed", "hardware_error", "safety_stop");
      return PATROL_SAFETY_STOP;
    }
    if (cancelRequested(missionId)) {
      pushMessage("Patrol cancelled by request before plant " + String(plantIndex), "info");
      endMission(missionId, "stopped", "cancelled");
      return PATROL_CANCELLED;
    }

    StepResult result = driveToNextPlant(plantIndex);

    if (result == STEP_SENSOR_ERROR) {
      haltForSensorError(plantIndex);
      failPatrolStep(missionId, plantIndex, "failed", "failed", "sensor_error", "sensor_error");
      return PATROL_HARDWARE_ERROR;
    }
    if (result == STEP_OBSTACLE) {
      pushMessage("Patrol stopped early: obstacle detected before plant " + String(plantIndex), "warning");
      failPatrolStep(missionId, plantIndex, "skipped", "stopped", "obstacle", "obstacle");
      return PATROL_OBSTACLE;
    }
    if (result == STEP_TIMEOUT) {
      pushMessage("Patrol stopped: couldn't find plant " + String(plantIndex) +
                  " within range — check spacing or PLANT_DETECT_CM calibration", "warning");
      failPatrolStep(missionId, plantIndex, "skipped", "stopped", "timeout", "timeout");
      return PATROL_TIMEOUT;
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
        failPatrolStep(missionId, plantIndex, "skipped", "stopped", "camera_blocked", "camera_blocked");
        return PATROL_CAMERA_BLOCKED;
      }
      result = driveToNextPlant(plantIndex);
      if (result == STEP_SENSOR_ERROR) {
        haltForSensorError(plantIndex);
        failPatrolStep(missionId, plantIndex, "failed", "failed", "sensor_error", "sensor_error");
        return PATROL_HARDWARE_ERROR;
      }
      if (result == STEP_OBSTACLE) {
        pushMessage("Patrol stopped early: obstacle detected before plant " + String(plantIndex), "warning");
        failPatrolStep(missionId, plantIndex, "skipped", "stopped", "obstacle", "obstacle");
        return PATROL_OBSTACLE;
      }
      if (result == STEP_TIMEOUT) {
        pushMessage("Patrol stopped: couldn't find plant " + String(plantIndex) +
                    " within range — check spacing or PLANT_DETECT_CM calibration", "warning");
        failPatrolStep(missionId, plantIndex, "skipped", "stopped", "timeout", "timeout");
        return PATROL_TIMEOUT;
      }
    }

    pushMessage("Plant " + String(plantIndex) + " found (3 confirmed readings, " +
                String(lastConfirmedDist, 1) + " cm)", "info");
    delay(PATROL_SETTLE_MS);

    // Duplicate detection: is this index already a registered plant?
    // Checked AFTER camera confirmation (matches "camera says yes ->
    // find/create Plant ID" in the mission diagram) so a false
    // ultrasonic trigger never gets checked against plant_locations at
    // all. known=true means "re-verifying a plant we've seen before,"
    // not "registering a new one" — savePlantLocation() below still
    // upserts either way (harmless refresh of the GPS fix on a known
    // plant), but mission_plants.known_plant carries the distinction
    // for the dashboard/history.
    bool knownPlant = isKnownPlant(plantIndex);
    logEvent("PLANT", knownPlant ? "Known plant — re-verifying" : "New plant candidate", plantIndex);

    // Soil check + water first, then save the GPS fix for this plant —
    // matches the field log sequence (servo/soil/pump, then GPS, then
    // resume patrol). Safe to call even with no GPS fix —
    // savePlantLocation() checks gps.location.isValid() itself and just
    // logs a warning + returns.
    if (!checkAndWaterHere(plantIndex)) {
      // Servo failure — checkAndWaterHere() already logged and pushed
      // the halt message; don't save a GPS fix or announce "continuing
      // patrol." camera_verified=true here (it got this far), but no
      // soil/water data exists to report.
      upsertMissionPlant(missionId, plantIndex, "failed", true, knownPlant, false, 0, false, false, 0, "servo_error");
      endMission(missionId, "failed", "hardware_error");
      return PATROL_HARDWARE_ERROR;
    }

    savePlantLocation(plantIndex);

    upsertMissionPlant(missionId, plantIndex, lastWatered ? "watered" : "visited",
                        true, knownPlant, lastSoilOk, lastSoilMoisture,
                        lastWatered, lastWatered, lastWaterDurationS, "");

    logEvent("ROBOT", "Continuing patrol...", plantIndex);
    Serial.println("==================================");
  }

  pushMessage("Patrol complete: " + String(numPlants) + " plant(s) checked", "success");
  endMission(missionId, "completed", "");
  return PATROL_COMPLETE;
}

// Asks the ESP32-CAM (via Supabase, no direct link between the boards)
// to photograph and classify whatever the ultrasonic sensor just found.
// Returns true if it should be treated as a plant — including when the
// check is disabled, times out, or the request itself fails, so a
// camera problem can never silently block the whole patrol. Returns
// false ONLY on an explicit "not a plant" answer from the ESP32-CAM.
// Logs the two-line CAMERA_ERROR sequence and fails open (always
// returns true) — used by every "couldn't get an answer" path below.
// Kept distinct from an explicit "not_plant" result: that's a real
// classification from a working camera and should stop the patrol
// from watering a non-plant; this is the camera being absent/broken,
// which must never block the robot.
bool cameraUnavailable(int plantIndex, const String& reason) {
  logEvent("CAMERA", "ERROR: " + reason, plantIndex);
  logEvent("CAMERA", "Continuing without camera verification", plantIndex);
  return true;
}

// Asks Supabase whether the ESP32-CAM is both (a) last reported online
// AND (b) heartbeated recently enough to trust — via the
// public.is_camera_online() RPC rather than reading the "online" column
// directly. Freshness is judged by Postgres's own now() against
// robot_status.updated_at (auto-refreshed by a DB trigger on every
// heartbeat upsert), NOT by this board comparing timestamps itself —
// this board has no RTC/NTP, so any on-device "is this timestamp too
// old" comparison would be unreliable. Pushing that comparison
// server-side means a stale-but-still-"online" row (e.g. the camera
// lost power without a clean disconnect) is correctly caught, instead
// of only catching an explicit online=false.
//
// Returns false — "treat as absent" — on no WiFi, a missing row, a
// stale row, an explicit online=false, or any request/parse failure,
// so a flaky read never gets mistaken for a present camera.
bool isCameraOnline() {
  if (WiFi.status() != WL_CONNECTED) return false;

  StaticJsonDocument<96> reqDoc;
  reqDoc["p_robot_id"] = CAM_ROBOT_ID;
  reqDoc["p_max_age_seconds"] = CAMERA_HEARTBEAT_MAX_AGE_S;
  String reqPayload; serializeJson(reqDoc, reqPayload);

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/is_camera_online";
  HTTPClient http;
  if (!http.begin(url)) return false;
  addHeaders(http);
  int code = http.POST(reqPayload);
  bool online = false;
  if (code == 200) {
    String resp = http.getString();
    resp.trim();
    online = (resp == "true");  // RPC returns a bare JSON boolean body
  }
  http.end();
  return online;
}

// Runtime "which workflow" decision, logged in the format the field
// output expects:
//   [CAMERA] Checking connection...
//   [CAMERA] CONNECTED / NOT CONNECTED  (+ "Automatically skipping camera" if absent)
bool checkCameraConnection(int plantIndex) {
  logEvent("CAMERA", "Checking connection...", plantIndex);

  if (CAMERA_CHECK_FORCE_DISABLE) {
    logEvent("CAMERA", "Disabled (manual override)", plantIndex);
    logEvent("CAMERA", "Automatically skipping camera", plantIndex);
    return false;
  }

  bool online = isCameraOnline();
  if (online) {
    logEvent("CAMERA", "CONNECTED", plantIndex);
  } else {
    logEvent("CAMERA", "NOT CONNECTED", plantIndex);
    logEvent("CAMERA", "Automatically skipping camera", plantIndex);
  }
  return online;
}

bool requestCameraCheck(int plantIndex) {
  if (!checkCameraConnection(plantIndex)) {
    return true;  // Camera absent/disabled: skip straight from
                   // ROBOT STOPPED to SERVO DOWN, no verification logs.
  }

  logEvent("CAMERA", "Checking plant...", plantIndex);

  // 1. Ask the ESP32-CAM to capture + classify. This firmware only
  //    requests it must be matched by an updated esp32cam_supabase_upload.ino
  //    that polls robot_commands for "camera_check" and a DB migration
  //    adding that command to the CHECK constraint — see the
  //    camera classification comment block above.
  StaticJsonDocument<128> reqDoc;
  reqDoc["robot_id"] = ROBOT_ID;
  reqDoc["command"] = "camera_check";
  reqDoc["value"] = plantIndex;
  String reqPayload; serializeJson(reqDoc, reqPayload);
  unsigned long requestedAt = millis();
  int reqCode = postJson(String(SUPABASE_URL) + "/rest/v1/robot_commands", reqPayload, false);
  if (reqCode < 200 || reqCode >= 300) {
    return cameraUnavailable(plantIndex, "Request failed (HTTP " + String(reqCode) + ")");
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

  return cameraUnavailable(plantIndex, "ESP32-CAM unavailable (timed out)");
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

// ------------------------------------------------------------------
// Plant Mission System — missions / mission_plants / safety supervisor
// ------------------------------------------------------------------

// Creates a missions row and returns its id, or -1 on any failure (no
// WiFi, request error, or an unparseable response) — callers must
// treat -1 as "mission tracking unavailable" and fall back to running
// the patrol untracked rather than crashing the lap over it. Uses
// Prefer: return=representation (unlike every other insert in this
// file) because this is the one write whose response we actually need
// to read back, not just fire-and-forget.
long createMission(int totalPlants) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  StaticJsonDocument<160> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["total_plants"] = totalPlants;
  String payload; serializeJson(doc, payload);

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/missions";
  if (!http.begin(url)) return -1;
  addHeaders(http);
  http.addHeader("Prefer", "return=representation");
  int code = http.POST(payload);
  long id = -1;
  if (code >= 200 && code < 300) {
    DynamicJsonDocument resDoc(256);
    if (!deserializeJson(resDoc, http.getString())) {
      JsonArray arr = resDoc.as<JsonArray>();
      if (arr.size() > 0) id = arr[0]["id"] | -1L;
    }
  }
  http.end();
  return id;
}

// Marks a mission completed/stopped/failed. stopReason may be "" for
// a clean completion (the column is nullable). Best-effort — a failed
// PATCH here is logged but never blocks the caller, since the patrol
// outcome itself has already happened by the time this runs.
void updateMissionStatus(long missionId, const String& status, const String& stopReason) {
  if (missionId < 0 || WiFi.status() != WL_CONNECTED) return;
  StaticJsonDocument<192> doc;
  doc["status"] = status;
  // completed_at is NOT set here — PostgREST doesn't evaluate SQL
  // functions inside a JSON payload, it would insert the literal
  // string "now()" and fail the timestamptz cast. A DB trigger
  // (set_missions_completed_at, see the accompanying migration) sets
  // it server-side whenever status leaves 'in_progress', the same
  // pattern already used for robot_status.last_fault_at.
  if (stopReason.length() > 0) doc["stop_reason"] = stopReason;
  String payload; serializeJson(doc, payload);

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/missions?id=eq." + String(missionId);
  if (!http.begin(url)) return;
  addHeaders(http);
  http.addHeader("Prefer", "return=minimal");
  int code = http.PATCH(payload);
  if (code < 200 || code >= 300) {
    Serial.printf("updateMissionStatus HTTP %d: %s\n", code, http.getString().c_str());
  }
  http.end();
}

// Returns true if plant_locations already has a saved spot for this
// index — the duplicate-detection signal. Scoped to plant_index, not
// GPS proximity (see migration header for why). Fails closed to
// false ("treat as new") on any WiFi/request problem, since the worse
// outcome of a false negative here is just re-saving the same GPS fix
// (harmless upsert), not a duplicate PLANT record being created.
bool isKnownPlant(int plantIndex) {
  if (WiFi.status() != WL_CONNECTED) return false;
  String url = String(SUPABASE_URL) + "/rest/v1/plant_locations?robot_id=eq." + ROBOT_ID +
               "&plant_index=eq." + String(plantIndex) + "&select=id&limit=1";
  HTTPClient http;
  if (!http.begin(url)) return false;
  addHeaders(http);
  int code = http.GET();
  bool known = false;
  if (code == 200) {
    DynamicJsonDocument doc(256);
    if (!deserializeJson(doc, http.getString())) {
      known = doc.as<JsonArray>().size() > 0;
    }
  }
  http.end();
  return known;
}

// Upserts one mission_plants row — the live progress-board entry for
// this plant within this mission, and (queried across missions) part
// of the plant's history. hasSoil/hasWater let the caller omit those
// fields entirely rather than writing a misleading 0, matching the
// pattern pushSensorData() already uses for optional readings.
void upsertMissionPlant(long missionId, int plantIndex, const String& status,
                         bool cameraVerified, bool knownPlant,
                         bool hasSoil, float soilMoisture,
                         bool watered, bool hasWaterDuration, float waterDurationS,
                         const String& failureReason) {
  if (missionId < 0 || WiFi.status() != WL_CONNECTED) return;
  StaticJsonDocument<384> doc;
  doc["mission_id"] = missionId;
  doc["robot_id"] = ROBOT_ID;
  doc["plant_index"] = plantIndex;
  doc["status"] = status;
  doc["camera_verified"] = cameraVerified;
  doc["known_plant"] = knownPlant;
  if (hasSoil) doc["soil_moisture"] = soilMoisture;
  doc["watered"] = watered;
  if (hasWaterDuration) doc["water_duration_s"] = waterDurationS;
  if (failureReason.length() > 0) doc["failure_reason"] = failureReason;
  String payload; serializeJson(doc, payload);
  String url = String(SUPABASE_URL) + "/rest/v1/mission_plants?on_conflict=mission_id,plant_index";
  postJson(url, payload, true);
}

// Latches the safety supervisor. Distinct from the per-lap halt
// functions (haltForSensorError etc.), which already stop the CURRENT
// lap on their own — this additionally blocks every FUTURE mission/
// AUTO start until safety_reset, so a person has to actually look at
// the robot rather than a retry silently walking into the same fault.
void reportSafetyFault(const String& reason) {
  safetyStopped = true;
  logEvent("SAFETY", "FAULT: " + reason, 0);
  pushMessage("Safety stop: " + reason + " — send safety_reset after checking the robot", "warning");
  if (WiFi.status() != WL_CONNECTED) return;
  StaticJsonDocument<192> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["safety_stopped"] = true;
  doc["last_fault"] = reason;
  String payload; serializeJson(doc, payload);
  postJson(String(SUPABASE_URL) + "/rest/v1/robot_status?on_conflict=robot_id", payload, true);
}

void safetyReset() {
  safetyStopped = false;
  logEvent("SAFETY", "Reset — missions/AUTO re-enabled", 0);
  pushMessage("Safety reset — AUTO and new missions re-enabled", "success");
  if (WiFi.status() != WL_CONNECTED) return;
  StaticJsonDocument<160> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["safety_stopped"] = false;
  doc["last_fault"] = nullptr;
  String payload; serializeJson(doc, payload);
  postJson(String(SUPABASE_URL) + "/rest/v1/robot_status?on_conflict=robot_id", payload, true);
}

// Runtime safety check, called at mission start and between every
// plant within patrolRow() — NOT a true background/independent
// process (this board is single-threaded and patrolRow() blocks for
// its duration, same constraint every other blocking call here
// already has), but checked far more often than the old per-lap-only
// halts, catching a condition that develops mid-mission instead of
// only at the boundaries. Returns false (unsafe) on an already-latched
// fault or critical battery.
bool checkSafety() {
  if (safetyStopped) return false;
  float voltage = 0;
  float batteryPercent = readBatteryPercent(voltage);
  if (!isnan(batteryPercent) && batteryPercent < BATTERY_CRITICAL_PERCENT) {
    reportSafetyFault("Battery critical (" + String(batteryPercent, 0) + "%)");
    return false;
  }
  return true;
}

// Polls for an unexecuted cancel_mission command targeting THIS
// mission specifically (value must equal missionId) and, if found,
// marks it executed and returns true. Called between plants inside
// patrolRow()'s loop — the only point where this blocking function
// can check for anything external, same limitation as every other
// mid-lap constraint in this file. A cancel_mission command for a
// different (already-finished) mission id is left unexecuted rather
// than silently consumed, so a stale/duplicate command doesn't
// cancel a later, unrelated mission.
bool cancelRequested(long missionId) {
  if (missionId < 0 || WiFi.status() != WL_CONNECTED) return false;
  String url = String(SUPABASE_URL) + "/rest/v1/robot_commands?robot_id=eq." + ROBOT_ID +
               "&command=eq.cancel_mission&executed=eq.false&value=eq." + String(missionId) +
               "&select=id&limit=1";
  HTTPClient http;
  if (!http.begin(url)) return false;
  addHeaders(http);
  int code = http.GET();
  bool found = false;
  long cmdId = -1;
  if (code == 200) {
    DynamicJsonDocument doc(256);
    if (!deserializeJson(doc, http.getString())) {
      JsonArray arr = doc.as<JsonArray>();
      if (arr.size() > 0) { found = true; cmdId = arr[0]["id"] | -1L; }
    }
  }
  http.end();
  if (found && cmdId >= 0) markCommandExecuted(cmdId);
  return found;
}

// Clears currentMissionId and syncs robot_status, on top of whatever
// terminal status the caller wants written — every patrolRow() exit
// path needs both, so this keeps them from drifting out of sync with
// each other.
void endMission(long missionId, const String& status, const String& stopReason) {
  updateMissionStatus(missionId, status, stopReason);
  currentMissionId = -1;
  pushRobotStatus();
}

// Combines the two writes every patrolRow() failure/skip path needs:
// a mission_plants row recording what happened at this plant, and the
// mission itself ending. Kept separate from endMission() because the
// clean-completion path (all plants done) has no per-plant failure
// row to write.
void failPatrolStep(long missionId, int plantIndex, const String& mpStatus,
                     const String& missionStatus, const String& stopReason,
                     const String& failureReason) {
  upsertMissionPlant(missionId, plantIndex, mpStatus, false, false, false, 0, false, false, 0, failureReason);
  endMission(missionId, missionStatus, stopReason);
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
// The ESP32Servo library gives no physical feedback (no position
// sensor / current sensing on this board) — a standard hobby servo can
// be unplugged, fallen off its mount, or have stripped gears and the
// PWM signal will still go out with no error reported. The only thing
// software CAN check is the control path: whether attach() actually
// succeeded and the Servo object still considers itself attached
// (never detached, LEDC channel still claimed). That catches "servo
// was never attached" or "got detached somehow" — it does NOT catch a
// servo that's electrically fine but mechanically dead. True failure
// detection needs feedback-capable hardware (a position-feedback
// servo, a current sensor on its supply line, or a limit switch on the
// probe) — this is the best signal available without that.
bool checkServoAvailable(int plantIndex) {
  logEvent("SERVO", "Checking...", plantIndex);
  bool ok = probeServo.attached();
  if (!ok) {
    logEvent("SERVO", "ERROR: Servo unavailable", plantIndex);
  }
  return ok;
}

// Servo failure halts the same way ultrasonic failure does: the probe
// can't be positioned, so soil reading and pump are both skipped
// (never attempted blind), no GPS fix is saved since the plant was
// never actually checked, and the caller must stop the whole patrol
// rather than moving on to the next plant.
void haltForServoError(int plantIndex) {
  logEvent("ROBOT", "STOPPED", plantIndex);
  logEvent("SOIL", "SKIPPED - probe cannot be positioned", plantIndex);
  logEvent("PUMP", "SKIPPED - no valid soil reading", plantIndex);
  logEvent("GPS", "Plant location NOT saved", plantIndex);
  logEvent("ROBOT", "Waiting for servo recovery", plantIndex);
  pushMessage("Patrol stopped: soil-probe servo not responding at plant " +
              String(plantIndex) + " — check servo power/signal wiring before resuming",
              "warning");
}

// Shared by patrolRow() and goToAndWaterAll() so the check-and-water
// logic only lives in one place. Returns true if the patrol should
// continue to the next plant, false if a servo failure means the whole
// patrol must halt here.
bool checkAndWaterHere(int plantIndex) {
  // Reset before every call so a stale value from a previous plant is
  // never mistaken for this one's result if a path below returns
  // early without reaching the soil read.
  lastSoilMoisture = NAN;
  lastSoilOk = false;
  lastWatered = false;
  lastWaterDurationS = 0;

  // 0. Confirm the probe servo is actually available before committing
  //    to anything — soil reading and watering both depend on it being
  //    physically in the ground first.
  if (!checkServoAvailable(plantIndex)) {
    haltForServoError(plantIndex);
    return false;
  }

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
  lastSoilOk = soilOk;
  lastSoilMoisture = soilPercent;
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
    logEvent("PUMP", "SKIPPED - SOIL ERROR", plantIndex);
    pushMessage("Plant " + String(plantIndex) + ": soil sensor reading failed", "warning");
    return true;  // Never auto-water on a failed/unavailable reading, but
                  // this isn't a servo failure — patrol still continues.
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

    lastWatered = true;
    lastWaterDurationS = PATROL_WATER_MS / 1000.0f;
    pushMessage("Plant " + String(plantIndex) + ": watering done", "success");
  } else {
    logEvent("PUMP", "Soil moisture sufficient", plantIndex);
    logEvent("PUMP", "OFF", plantIndex);
    logEvent("PUMP", "Watering not required", plantIndex);
  }

  return true;
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
    if (!checkAndWaterHere(plantIndex)) {
      return;  // Servo failure — halt the GPS patrol here too.
    }
  }

  pushMessage("GPS patrol complete: " + String(numPlants) + " plant(s) visited", "success");
}

// Pre-start check for AUTO mode only — manual patrol_row/goto_plant/etc.
// are unaffected and still rely purely on the runtime checks inside
// driveToNextPlant()/checkAndWaterHere() (ULTRASONIC_FAIL_STREAK,
// checkServoAvailable()). This gate exists because AUTO is meant to run
// unattended for many laps in a row, so it's worth refusing to even
// start rather than driving off and hitting the first hardware failure
// mid-lap. Deliberately NOT re-run every cycle (see runAutoPatrolCycle())
// — once AUTO is confirmed healthy at start, the existing per-step
// runtime checks are what protect each lap after that.
bool runAutoHardwareGate() {
  logEvent("AUTO", "Starting hardware check...", 0);

  bool ultrasonicOk = false;
  for (int i = 0; i < AUTO_GATE_PING_ATTEMPTS && !ultrasonicOk; i++) {
    if (readUltrasonicCm() > 0) ultrasonicOk = true;
    delay(AUTO_GATE_PING_DELAY_MS);
  }
  if (!ultrasonicOk) {
    logEvent("ULTRASONIC", "ERROR: No response", 0);
    logEvent("AUTO", "START BLOCKED", 0);
    logEvent("ROBOT", "STOPPED", 0);
    pushMessage("AUTO mode blocked: ultrasonic sensor not responding — check TRIG/ECHO wiring", "warning");
    return false;
  }

  // Servo isn't in your original diagram's gate, but it's just as
  // required for every lap (soil probe down/up) and just as cheap to
  // check up front, so it's included here too rather than only being
  // discovered mid-lap on the first plant.
  if (!probeServo.attached()) {
    logEvent("SERVO", "ERROR: Servo unavailable", 0);
    logEvent("AUTO", "START BLOCKED", 0);
    logEvent("ROBOT", "STOPPED", 0);
    pushMessage("AUTO mode blocked: soil-probe servo not responding — check servo wiring", "warning");
    return false;
  }

  logEvent("AUTO", "Hardware check passed", 0);
  return true;
}

// Runs one patrol lap and decides whether AUTO should keep going. Called
// from loop() itself (not from executeCommand()) — see loop() below —
// so that "keep repeating" falls naturally out of loop() being called
// again and again by the Arduino runtime, the same way every other
// periodic task in this file already works, rather than a hand-rolled
// while(autoModeActive) loop that would need its own command-polling
// logic duplicated inside it.
//
// A clean lap (or one that only paused for camera retries and still
// finished) re-arms for another lap. A lap that ends in a condition a
// person should look at — obstacle, couldn't find the next plant,
// repeated non-plant object, or a genuine hardware failure — drops
// AUTO back to manual instead of blindly retrying into the same
// problem forever.
void runAutoPatrolCycle() {
  PatrolResult result = patrolRow(autoPatrolPlantCount);

  if (result == PATROL_HARDWARE_ERROR || result == PATROL_SAFETY_STOP) {
    autoModeActive = false;
    currentMode = "manual";
    logEvent("AUTO", "Autonomous patrol stopped: hardware/safety fault", 0);
    pushMessage("AUTO mode disabled: hardware/safety fault during patrol — send safety_reset before re-enabling", "warning");
    return;
  }

  if (result == PATROL_OBSTACLE || result == PATROL_TIMEOUT || result == PATROL_CAMERA_BLOCKED) {
    autoModeActive = false;
    currentMode = "manual";
    logEvent("AUTO", "Autonomous patrol stopped: needs attention", 0);
    pushMessage("AUTO mode disabled: patrol stopped early — check the field, then re-enable AUTO", "warning");
    return;
  }

  if (result == PATROL_CANCELLED) {
    autoModeActive = false;
    currentMode = "manual";
    logEvent("AUTO", "Autonomous patrol cancelled by request", 0);
    pushMessage("AUTO mode disabled: patrol was cancelled", "info");
    return;
  }

  // PATROL_COMPLETE — settle, then let loop() call this again.
  logEvent("AUTO", "Cycle complete", 0);
  delay(AUTO_CYCLE_SETTLE_MS);
  if (autoModeActive) logEvent("AUTO", "Repeating patrol", 0);
}

void executeCommand(const String& command, int value) {
  if (command == "forward") {
    digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW); digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW); motorState="forward";
    applySpeed();  // BUGFIX: was missing — ENA/ENB stayed at 0% PWM on a
                    // fresh boot, so direction was set but no current
                    // ever reached the motors.
  } else if (command == "backward") {
    digitalWrite(IN1_PIN,LOW); digitalWrite(IN2_PIN,HIGH); digitalWrite(IN3_PIN,LOW); digitalWrite(IN4_PIN,HIGH); motorState="backward";
    applySpeed();  // BUGFIX: same as forward, above.
  } else if (command == "left") {
    digitalWrite(IN1_PIN,LOW); digitalWrite(IN2_PIN,HIGH); digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW); motorState="left";
    applySpeed();  // BUGFIX: same as forward, above.
  } else if (command == "right") {
    digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW); digitalWrite(IN3_PIN,LOW); digitalWrite(IN4_PIN,HIGH); motorState="right";
    applySpeed();  // BUGFIX: same as forward, above.
  } else if (command == "stop") {
    stopMotors(); motorState="stopped";
  } else if (command == "pump_on") {
    digitalWrite(RELAY_PIN,HIGH); digitalWrite(LED_PUMP_PIN,HIGH); pumpStatus=true;
  } else if (command == "pump_off") {
    digitalWrite(RELAY_PIN,LOW); digitalWrite(LED_PUMP_PIN,LOW); pumpStatus=false;
  } else if (command == "set_speed" && value >= 0 && value <= 255) {
    speedValue=value;
  } else if (command == "set_mode_auto") {
    if (safetyStopped) {
      currentMode = "manual";
      autoModeActive = false;
      pushMessage("AUTO mode blocked: safety supervisor has a latched fault — send safety_reset first", "warning");
    } else if (runAutoHardwareGate()) {
      currentMode = "auto";
      autoModeActive = true;
      autoPatrolPlantCount = (value > 0) ? value : AUTO_PATROL_DEFAULT_PLANTS;
      logEvent("AUTO", "Autonomous patrol started", 0);
      pushMessage("AUTO mode enabled — autonomous patrol starting", "success");
    } else {
      currentMode = "manual";
      autoModeActive = false;
      // No extra pushMessage here — runAutoHardwareGate() already sent
      // the specific "AUTO mode blocked: ..." reason.
    }
  } else if (command == "set_mode_manual") {
    bool wasAuto = autoModeActive;
    currentMode = "manual";
    autoModeActive = false;
    if (wasAuto) {
      logEvent("AUTO", "Autonomous patrol stopped (manual override)", 0);
      pushMessage("AUTO mode disabled", "info");
    }
  } else if (command == "patrol_row" || command == "start_mission") {
    // Same call either way — patrolRow() itself creates the mission
    // row now, regardless of which command (or AUTO) triggered it.
    patrolRow(value > 0 ? value : 1);
  } else if (command == "cancel_mission") {
    // Only takes effect between plants inside a currently-running
    // patrolRow() — see cancelRequested()'s comment for why a
    // single-threaded blocking loop can't react any faster than that.
    // If no mission is running, this command is simply left unexecuted
    // by cancelRequested() (nothing to cancel) rather than acted on
    // here directly.
    pushMessage("Cancel requested — will take effect before the next plant", "info");
  } else if (command == "safety_reset") {
    safetyReset();
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
  }
  // Note: set_mode_auto / set_mode_manual deliberately do NOT push a
  // generic "Mode switched to X" message here — runAutoHardwareGate(),
  // the set_mode_auto branch above, and the set_mode_manual branch
  // above each already push a specific, accurate message for every
  // outcome (started / blocked / disabled), so a generic one here would
  // just be a redundant or, worse, misleading duplicate (e.g. it would
  // say "switched to manual" even when AUTO was blocked before ever
  // starting).
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
    String body = http.getString();
    DynamicJsonDocument doc(4096);
    DeserializationError err = deserializeJson(doc, body);
    if (!err) {
      JsonArray arr = doc.as<JsonArray>();
      Serial.printf("[COMMANDS] Poll OK — %d pending\n", arr.size());
      for (JsonObject cmd : arr) {
        long id=cmd["id"]|0; String command=cmd["command"]|""; int value=cmd["value"].isNull()?-1:(int)cmd["value"];
        Serial.printf("[COMMANDS] Executing #%ld: %s (%d)\n", id, command.c_str(), value);
        executeCommand(command,value); markCommandExecuted(id);
        Serial.printf("[COMMANDS] #%ld marked executed\n", id);
      }
    } else {
      // Previously silent — a parse failure here meant commands would
      // sit Pending forever with zero indication why, since this is
      // the ONLY place a non-HTTP-error failure could happen.
      Serial.printf("[COMMANDS] JSON parse failed: %s | body: %s\n", err.c_str(), body.c_str());
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

// One-time boot report — logs the same OK/ERROR shape as the per-plant
// checks so a glance at the very top of the Serial log tells you
// whether today's run is even worth trusting, before any patrol
// command comes in. This is ADVISORY only: it never blocks setup() or
// refuses to come online, because a false "ultrasonic not detecting
// anything" reading at boot (nothing happens to be in front of the
// sensor yet) is completely normal and shouldn't stop the robot from
// accepting WiFi/manual commands. The real enforcement — halting mid-
// patrol on a genuine failure — is what checkServoAvailable(),
// requestCameraCheck(), and the ULTRASONIC_FAIL_STREAK logic already
// do live, during patrol. Same honesty caveat as checkServoAvailable():
// none of these are true hardware self-tests (no feedback pins wired
// up), just the best signal software can read at boot.
void systemSelfCheck() {
  logEvent("ROBOT", "System starting", 0);

  // Ultrasonic: a short burst of pings. One successful echo (>0) is
  // enough to call it OK at boot — this does NOT run the
  // ULTRASONIC_FAIL_STREAK logic, it's just a quick sanity read.
  bool ultrasonicOk = false;
  for (int i = 0; i < 5 && !ultrasonicOk; i++) {
    if (readUltrasonicCm() > 0) ultrasonicOk = true;
    delay(30);
  }
  logEvent("ULTRASONIC", ultrasonicOk ? "Sensor: OK" : "Sensor: No echo yet (may be normal if nothing is in range)", 0);

  // Servo: same attached()-only check used during patrol — see
  // checkServoAvailable() for what this can and can't detect.
  logEvent("SERVO", probeServo.attached() ? "Status: OK" : "Status: ERROR - not attached", 0);

  // Soil sensor: one read.
  int soilRawBoot = 0;
  bool soilOk = !isnan(readSoilPercent(soilRawBoot));
  logEvent("SOIL", soilOk ? "Sensor: OK" : "Sensor: ERROR - reading failed", 0);

  // Camera: optional, so this is informational either way — matches
  // the CONNECTED / NOT CONNECTED wording used during patrol.
  logEvent("CAMERA", isCameraOnline() ? "Status: CONNECTED" : "Status: NOT CONNECTED (optional - will auto-skip)", 0);

  // GPS: at boot a fix is rarely available yet (cold-start acquisition
  // can take a minute or more), so this is a status snapshot, not a
  // failure — GPS is optional for operation either way.
  logEvent("GPS", gps.location.isValid() ? "Status: OK (fix acquired)" : "Status: Acquiring fix...", 0);

  // Pump: no sensor exists to confirm the relay/pump actually works —
  // this only confirms the relay pin was configured as OUTPUT and
  // left LOW (off) by setup(), nothing electrical is verified.
  logEvent("PUMP", "Relay configured (untested - no feedback sensor)", 0);
}

// Checked once, right after WiFi connects at boot. Distinguishes "this
// crashed and immediately came back" from "this is a normal power-on"
// using esp_reset_reason() — a genuine power-on always resets
// crashBootCount, so plugging the battery in fresh never falsely
// trips this. Only unexpected resets (brownout, panic, watchdog)
// count toward the streak.
//
// This can't stop a brownout from happening — that's the hardware
// problem covered separately (capacitor + battery condition). What it
// stops is the SPECIFIC failure mode we saw: the same crash-causing
// command being blindly retried by every new boot, forever, with no
// visible end state. After MAX_CRASH_BOOTS in a row, it breaks that
// cycle instead of letting it continue indefinitely.
void checkBootLoop() {
  esp_reset_reason_t reason = esp_reset_reason();
  bool badReset = (reason == ESP_RST_BROWNOUT || reason == ESP_RST_PANIC ||
                    reason == ESP_RST_INT_WDT || reason == ESP_RST_TASK_WDT ||
                    reason == ESP_RST_WDT);

  if (reason == ESP_RST_POWERON) {
    crashBootCount = 0;  // real power cycle — clean slate, not a crash
  } else if (badReset) {
    crashBootCount++;
    logEvent("SAFETY", "Unexpected reset #" + String(crashBootCount) +
                        " (reason code " + String((int)reason) + ")", 0);
  }
  // Other reset reasons (e.g. ESP_RST_SW from a deliberate restart, if
  // one's ever added) neither increment nor clear the streak — treated
  // as neutral rather than assumed safe or unsafe.

  if (crashBootCount >= MAX_CRASH_BOOTS) {
    reportSafetyFault(String(crashBootCount) + " unexpected reboots in a row — " +
                       "likely a command that crashes the board on every attempt " +
                       "(check power supply/capacitor). Pending commands cleared " +
                       "so they stop being retried; send safety_reset after checking " +
                       "the hardware.");
    clearStuckCommands();
    crashBootCount = 0;  // don't re-trip on the VERY next boot too —
                          // safetyStopped is now latched and already
                          // blocks missions/AUTO, which is what
                          // actually prevents the loop from continuing.
  }
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
    checkBootLoop();
  }
  systemSelfCheck();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
  unsigned long now=millis();
  if (now-lastSensorPush >= SENSOR_INTERVAL_MS) { lastSensorPush=now; pushSensorData(); }
  if (now-lastStatusPush >= STATUS_INTERVAL_MS) { lastStatusPush=now; pushRobotStatus(); }
  if (now-lastCommandPoll >= COMMAND_POLL_MS) { lastCommandPoll=now; pollCommands(); }
  if (now-lastMessagePoll >= MESSAGE_POLL_MS) { lastMessagePoll=now; pollIncomingMessages(); }

  // AUTO mode: run one patrol lap per loop() pass while active. Placed
  // after pollCommands() above so a queued set_mode_manual is picked up
  // and applied BEFORE the next lap starts (not mid-lap — patrolRow()
  // blocks for its full duration with no command polling inside it,
  // same as it always has for a manually-triggered patrol_row).
  if (autoModeActive) {
    runAutoPatrolCycle();
  }
}
