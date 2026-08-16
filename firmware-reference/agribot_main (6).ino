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

// --- Patrol auto-watering ---
const float PATROL_WATER_THRESHOLD = 30.0f;     // below this soil %, water the plant
const unsigned long PATROL_WATER_MS = 3000;     // pump-on duration per plant — start
                                                 // estimate, calibrate to your pump's
                                                 // flow rate and pot/root size

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
StepResult driveToNextPlant() {
  digitalWrite(IN1_PIN,HIGH); digitalWrite(IN2_PIN,LOW);
  digitalWrite(IN3_PIN,HIGH); digitalWrite(IN4_PIN,LOW);
  motorState = "forward";
  applySpeed();

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
      return STEP_PLANT_FOUND;
    }

    prevPrevDist = prevDist;
    prevDist = dist;
    delay(20);
  }

  stopMotors(); motorState = "stopped";
  Serial.println("Timeout");
  return STEP_TIMEOUT;
}

// Drives to each plant in a row, stopping at each one to read soil
// moisture and push the result to Supabase.
void patrolRow(int numPlants) {
  if (numPlants <= 0) numPlants = 1;
  pushMessage("Patrol started: checking " + String(numPlants) + " plant(s)", "info");

  for (int plantIndex = 1; plantIndex <= numPlants; plantIndex++) {
    StepResult result = driveToNextPlant();

    if (result == STEP_OBSTACLE) {
      pushMessage("Patrol stopped early: obstacle detected before plant " + String(plantIndex), "warning");
      return;
    }
    if (result == STEP_TIMEOUT) {
      pushMessage("Patrol stopped: couldn't find plant " + String(plantIndex) +
                  " within range — check spacing or PLANT_DETECT_CM calibration", "warning");
      return;
    }

    pushMessage("Plant " + String(plantIndex) + " found (3 confirmed readings, " +
                String(lastConfirmedDist, 1) + " cm)", "info");
    delay(PATROL_SETTLE_MS);

    // Auto-save this plant's GPS fix right where the ultrasonic confirmed
    // it, so patrol and location-saving can't drift out of sync. Safe to
    // call even with no GPS fix — savePlantLocation() checks
    // gps.location.isValid() itself and just logs a warning + returns.
    savePlantLocation(plantIndex);

    checkAndWaterHere(plantIndex);
  }

  pushMessage("Patrol complete: " + String(numPlants) + " plant(s) checked", "success");
}

// Records the robot's current GPS fix as "plant N is here." Upserts so
// re-saving the same plant index overwrites the old spot.
void savePlantLocation(int plantIndex) {
  if (!gps.location.isValid()) {
    pushMessage("Can't save plant " + String(plantIndex) + ": no GPS fix yet", "warning");
    return;
  }
  StaticJsonDocument<256> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["plant_index"] = plantIndex;
  doc["latitude"] = gps.location.lat();
  doc["longitude"] = gps.location.lng();
  String payload; serializeJson(doc, payload);
  String url = String(SUPABASE_URL) + "/rest/v1/plant_locations?on_conflict=robot_id,plant_index";
  int code = postJson(url, payload, true);
  if (code >= 200 && code < 300) {
    pushMessage("Saved plant " + String(plantIndex) + " location", "success");
  } else {
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
  int soilRaw = 0;
  float soilPercent = readSoilPercent(soilRaw);

  if (isnan(soilPercent)) {
    pushMessage("Plant " + String(plantIndex) + ": soil sensor reading failed", "warning");
    return;
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

  if (soilPercent < PATROL_WATER_THRESHOLD) {
    pushMessage("Plant " + String(plantIndex) + " is dry (" + String(soilPercent, 0) +
                "%) — watering for " + String(PATROL_WATER_MS / 1000) + "s", "warning");

    digitalWrite(RELAY_PIN, HIGH); digitalWrite(LED_PUMP_PIN, HIGH); pumpStatus = true;
    pushRobotStatus();
    delay(PATROL_WATER_MS);
    digitalWrite(RELAY_PIN, LOW); digitalWrite(LED_PUMP_PIN, LOW); pumpStatus = false;
    pushRobotStatus();

    pushMessage("Plant " + String(plantIndex) + ": watering done", "success");
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
