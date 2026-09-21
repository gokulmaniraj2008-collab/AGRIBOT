// ============================================================
// AGRIBOT ESP32 - 2 PLANT AUTONOMOUS VERSION
//
// Hardware:
//   ESP32 + L298N
//   2x HC-SR04 ultrasonic sensors = obstacle detection
//   1x IR position marker = plant station detection
//   2x soil moisture sensors = LEFT + RIGHT, read in one cycle
//   2x servos = one probe mechanism per plant
//   2x relays + 2x pumps = independent watering
//   DHT22 = temperature/humidity
//
// Flow:
//   POWER ON -> STOP 3s -> MOVE
//   -> IR marker -> STOP
//   -> BOTH probes DOWN
//   -> read LEFT + RIGHT soil
//   -> water LEFT/RIGHT independently
//   -> BOTH probes UP
//   -> continue
//
// Supabase:
//   agribot_sensor_data = live readings
//   agribot_log         = event history
// ============================================================

#include <Arduino.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ============================================================
// WiFi
// ============================================================

const char* WIFI_SSID = "AGRIBOT_WIFI";
const char* WIFI_PASS = "12345678";

WebServer server(80);

// ============================================================
// Supabase
// ============================================================

const char* SB_LOG_URL =
  "https://hvnasippwadzygnaodpp.supabase.co/rest/v1/agribot_log";

const char* SB_SENSOR_URL =
  "https://hvnasippwadzygnaodpp.supabase.co/rest/v1/agribot_sensor_data";

// Existing Supabase anon key from the previous firmware.
// Never replace this with a service_role/secret key.
const char* SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bmFzaXBwd2FkenlnbmFvZHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjg3NDMsImV4cCI6MjA5MTUwNDc0M30.dcS0J77idvjkwNesRJS7C-LfmhSDlILASMK65AesRaM";

// ============================================================
// L298N MOTOR PINS - unchanged from old version
// ============================================================

#define IN1 27
#define IN2 26
#define ENA 25

#define IN3 33
#define IN4 32
#define ENB 14

#define PWM_FREQ 5000
#define PWM_RES 8
#define MOTOR_SPEED 200

// ============================================================
// ULTRASONIC
// IMPORTANT: HC-SR04 ECHO must be reduced to 3.3V for ESP32.
// ============================================================

#define TRIG_LEFT 5
#define ECHO_LEFT 18

#define TRIG_RIGHT 19
#define ECHO_RIGHT 21

#define STOP_DISTANCE_CM 15

// ============================================================
// IR POSITION MARKER
// GPIO36 is input-only and is suitable for a simple IR receiver.
// Change IR_ACTIVE if your module outputs HIGH on detection.
// ============================================================

#define IR_POSITION_PIN 36
#define IR_ACTIVE LOW

// ============================================================
// SERVOS
// One servo = one soil probe
// ============================================================

#define SERVO_LEFT_PIN 13
#define SERVO_RIGHT_PIN 23

#define PROBE_UP_ANGLE 0
#define PROBE_DOWN_ANGLE 90

#define SERVO_SETTLE_MS 1000

Servo leftProbeServo;
Servo rightProbeServo;

// ============================================================
// SOIL MOISTURE
// GPIO34/35 are ADC input-only pins.
// ============================================================

#define SOIL_LEFT_PIN 34
#define SOIL_RIGHT_PIN 35

// Calibrate these values for YOUR probes.
#define SOIL_DRY_VALUE 4095
#define SOIL_WET_VALUE 1200

#define SOIL_LOW_THRESHOLD 30

// ============================================================
// DHT22
// ============================================================

#define DHT_PIN 15
#define DHT_TYPE DHT22

DHT dht(DHT_PIN, DHT_TYPE);

// ============================================================
// RELAYS + PUMPS
// Relay 1 -> left pump
// Relay 2 -> right pump
// ============================================================

#define RELAY_LEFT 4
#define RELAY_RIGHT 16

#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ============================================================
// TIMING
// ============================================================

#define START_DELAY_MS 3000
#define WATER_RECHECK_MS 5000
#define MAX_WATER_CYCLES 24

// After servicing a station, move away from the marker.
// stationLock is intentionally NOT cleared here; it is cleared
// only after the IR marker becomes inactive.
#define LEAVE_STATION_MS 3000

// ============================================================
// STATE
// ============================================================

String statusText = "Starting...";
String motorMode = "STOPPED";
String plantPosition = "NONE";

int leftSoil = 0;
int rightSoil = 0;

float lastTemp = 0;
float lastHum = 0;

long leftDistance = -1;
long rightDistance = -1;

bool leftPump = false;
bool rightPump = false;

bool stationLock = false;

// ============================================================
// Helpers
// ============================================================

void waitMs(unsigned long ms) {
  unsigned long start = millis();

  while (millis() - start < ms) {
    server.handleClient();
    delay(10);
  }
}

// ============================================================
// Ultrasonic
// ============================================================

long readUltrasonic(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);

  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);

  if (duration == 0) {
    return -1;
  }

  return (long)(duration * 0.0343 / 2.0);
}

// ============================================================
// Soil
// ============================================================

int readSoilPercent(int pin) {
  int raw = analogRead(pin);

  int percent = map(
    raw,
    SOIL_DRY_VALUE,
    SOIL_WET_VALUE,
    0,
    100
  );

  return constrain(percent, 0, 100);
}

// ============================================================
// Read both plants in one sensor cycle
// ============================================================

void readSensors() {
  leftSoil = readSoilPercent(SOIL_LEFT_PIN);
  rightSoil = readSoilPercent(SOIL_RIGHT_PIN);

  leftDistance = readUltrasonic(TRIG_LEFT, ECHO_LEFT);
  rightDistance = readUltrasonic(TRIG_RIGHT, ECHO_RIGHT);

  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) {
    lastTemp = t;
  }

  if (!isnan(h)) {
    lastHum = h;
  }
}

// ============================================================
// Position marker
// ============================================================

bool plantMarkerDetected() {
  return digitalRead(IR_POSITION_PIN) == IR_ACTIVE;
}

// ============================================================
// Motors
// ============================================================

void motorsForward() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);

  ledcWrite(ENA, MOTOR_SPEED);
  ledcWrite(ENB, MOTOR_SPEED);

  motorMode = "FORWARD";
}

void motorsReverse() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);

  ledcWrite(ENA, MOTOR_SPEED);
  ledcWrite(ENB, MOTOR_SPEED);

  motorMode = "REVERSE";
}

void motorsStop() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);

  ledcWrite(ENA, 0);
  ledcWrite(ENB, 0);

  motorMode = "STOPPED";
}

// ============================================================
// Pumps
// ============================================================

void setLeftPump(bool state) {
  leftPump = state;
  digitalWrite(RELAY_LEFT, state ? RELAY_ON : RELAY_OFF);
}

void setRightPump(bool state) {
  rightPump = state;
  digitalWrite(RELAY_RIGHT, state ? RELAY_ON : RELAY_OFF);
}

void stopAllPumps() {
  setLeftPump(false);
  setRightPump(false);
}

// ============================================================
// Probe mechanisms
// ============================================================

void probesUp() {
  leftProbeServo.write(PROBE_UP_ANGLE);
  rightProbeServo.write(PROBE_UP_ANGLE);
}

void probesDown() {
  leftProbeServo.write(PROBE_DOWN_ANGLE);
  rightProbeServo.write(PROBE_DOWN_ANGLE);
}

// ============================================================
// Distance helper
// ============================================================

int minimumValidDistance() {
  int result = 999;

  if (leftDistance > 0) {
    result = min(result, (int)leftDistance);
  }

  if (rightDistance > 0) {
    result = min(result, (int)rightDistance);
  }

  if (result == 999) {
    return -1;
  }

  return result;
}

// ============================================================
// Supabase
// ============================================================

void postJson(
  const char* url,
  const String& body,
  const char* tag
) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("%s: WiFi disconnected\n", tag);
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  http.setConnectTimeout(3000);
  http.setTimeout(3000);

  if (!http.begin(client, url)) {
    Serial.printf("%s: begin failed\n", tag);
    return;
  }

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  http.addHeader(
    "apikey",
    SB_KEY
  );

  http.addHeader(
    "Authorization",
    String("Bearer ") + SB_KEY
  );

  http.addHeader(
    "Prefer",
    "return=minimal"
  );

  int code = http.POST(body);

  Serial.printf(
    "%s: HTTP %d\n",
    tag,
    code
  );

  http.end();
}

// ============================================================
// Supabase logging
// ============================================================

void logEverything() {
  String relayAny =
    (leftPump || rightPump) ? "true" : "false";

  // ----------------------------------------------------------
  // Sensor table
  // ----------------------------------------------------------

  String sensorBody = "{";

  sensorBody +=
    "\"soil_moisture\":" +
    String((leftSoil + rightSoil) / 2.0, 1) + ",";

  sensorBody +=
    "\"soil_left_pct\":" +
    String(leftSoil) + ",";

  sensorBody +=
    "\"soil_right_pct\":" +
    String(rightSoil) + ",";

  sensorBody +=
    "\"temperature\":" +
    String(lastTemp, 1) + ",";

  sensorBody +=
    "\"humidity\":" +
    String(lastHum, 1) + ",";

  sensorBody +=
    "\"distance_cm\":" +
    String(minimumValidDistance()) + ",";

  sensorBody +=
    "\"distance_left_cm\":" +
    String(leftDistance) + ",";

  sensorBody +=
    "\"distance_right_cm\":" +
    String(rightDistance) + ",";

  sensorBody +=
    "\"relay\":" +
    relayAny + ",";

  sensorBody +=
    "\"relay_left\":" +
    String(leftPump ? "true" : "false") + ",";

  sensorBody +=
    "\"relay_right\":" +
    String(rightPump ? "true" : "false") + ",";

  sensorBody +=
    "\"motor\":\"" +
    motorMode + "\",";

  sensorBody +=
    "\"plant_position\":\"" +
    plantPosition + "\",";

  sensorBody +=
    "\"status\":\"" +
    statusText + "\"";

  sensorBody += "}";

  postJson(
    SB_SENSOR_URL,
    sensorBody,
    "Sensor"
  );

  // ----------------------------------------------------------
  // Log table
  // ----------------------------------------------------------

  String logBody = "{";

  logBody +=
    "\"status\":\"" +
    statusText + "\",";

  logBody +=
    "\"distance_cm\":" +
    String(minimumValidDistance()) + ",";

  logBody +=
    "\"soil_pct\":" +
    String((leftSoil + rightSoil) / 2) + ",";

  logBody +=
    "\"soil_left_pct\":" +
    String(leftSoil) + ",";

  logBody +=
    "\"soil_right_pct\":" +
    String(rightSoil) + ",";

  logBody +=
    "\"temp_c\":" +
    String(lastTemp, 1) + ",";

  logBody +=
    "\"hum_pct\":" +
    String(lastHum, 1) + ",";

  logBody +=
    "\"relay\":" +
    relayAny + ",";

  logBody +=
    "\"relay_left\":" +
    String(leftPump ? "true" : "false") + ",";

  logBody +=
    "\"relay_right\":" +
    String(rightPump ? "true" : "false") + ",";

  logBody +=
    "\"distance_left_cm\":" +
    String(leftDistance) + ",";

  logBody +=
    "\"distance_right_cm\":" +
    String(rightDistance) + ",";

  logBody +=
    "\"motor\":\"" +
    motorMode + "\",";

  logBody +=
    "\"plant_position\":\"" +
    plantPosition + "\"";

  logBody += "}";

  postJson(
    SB_LOG_URL,
    logBody,
    "History"
  );
}

// ============================================================
// Local dashboard
// ============================================================

void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">

<title>AGRIBOT ESP32</title>

<style>
body{
  font-family:Arial;
  background:#111;
  color:#fff;
  padding:20px;
}

.card{
  background:#222;
  padding:18px;
  margin:10px 0;
  border-radius:12px;
}

.value{
  font-size:25px;
  font-weight:bold;
}

.grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
}
</style>
</head>

<body>

<h1>🤖 AGRIBOT</h1>
)rawliteral";

  html +=
    "<div class='card'>Status:"
    "<div class='value'>" +
    statusText +
    "</div></div>";

  html +=
    "<div class='card'>Plant Position:"
    "<div class='value'>" +
    plantPosition +
    "</div></div>";

  html += "<div class='grid'>";

  html +=
    "<div class='card'>🌱 LEFT Soil:"
    "<div class='value'>" +
    String(leftSoil) +
    " %</div></div>";

  html +=
    "<div class='card'>🌱 RIGHT Soil:"
    "<div class='value'>" +
    String(rightSoil) +
    " %</div></div>";

  html +=
    "<div class='card'>📡 LEFT Distance:"
    "<div class='value'>" +
    String(leftDistance) +
    " cm</div></div>";

  html +=
    "<div class='card'>📡 RIGHT Distance:"
    "<div class='value'>" +
    String(rightDistance) +
    " cm</div></div>";

  html +=
    "<div class='card'>💧 LEFT Pump:"
    "<div class='value'>" +
    String(leftPump ? "ON" : "OFF") +
    "</div></div>";

  html +=
    "<div class='card'>💧 RIGHT Pump:"
    "<div class='value'>" +
    String(rightPump ? "ON" : "OFF") +
    "</div></div>";

  html += "</div>";

  html +=
    "<div class='card'>🌡 Temperature:"
    "<div class='value'>" +
    String(lastTemp, 1) +
    " C</div></div>";

  html +=
    "<div class='card'>💨 Humidity:"
    "<div class='value'>" +
    String(lastHum, 1) +
    " %</div></div>";

  html +=
    "<div class='card'>🚗 Motor:"
    "<div class='value'>" +
    motorMode +
    "</div></div>";

  html +=
    "</body></html>";

  server.send(
    200,
    "text/html",
    html
  );
}

// ============================================================
// Service BOTH plants
// ============================================================

void servicePlants() {
  motorsStop();
  stopAllPumps();

  statusText =
    "Plant station detected - STOP";

  Serial.println(statusText);

  // ----------------------------------------------------------
  // Lower both probes
  // ----------------------------------------------------------

  probesDown();

  statusText =
    "Both probes DOWN";

  Serial.println(statusText);

  waitMs(SERVO_SETTLE_MS);

  // ----------------------------------------------------------
  // Read both soil sensors
  // ----------------------------------------------------------

  readSensors();

  Serial.printf(
    "LEFT SOIL = %d%% | RIGHT SOIL = %d%%\n",
    leftSoil,
    rightSoil
  );

  // ----------------------------------------------------------
  // Independent watering
  // ----------------------------------------------------------

  int cycles = 0;

  while (
    leftSoil < SOIL_LOW_THRESHOLD ||
    rightSoil < SOIL_LOW_THRESHOLD
  ) {
    if (cycles >= MAX_WATER_CYCLES) {
      statusText =
        "Watering timeout - check tank/probes";

      Serial.println(statusText);
      break;
    }

    cycles++;

    // LEFT plant
    if (leftSoil < SOIL_LOW_THRESHOLD) {
      setLeftPump(true);
      Serial.println(
        "LEFT DRY -> Pump 1 ON"
      );
    } else {
      setLeftPump(false);
    }

    // RIGHT plant
    if (rightSoil < SOIL_LOW_THRESHOLD) {
      setRightPump(true);
      Serial.println(
        "RIGHT DRY -> Pump 2 ON"
      );
    } else {
      setRightPump(false);
    }

    statusText =
      "Watering cycle " +
      String(cycles) +
      "/" +
      String(MAX_WATER_CYCLES);

    Serial.println(statusText);

    logEverything();

    waitMs(WATER_RECHECK_MS);

    // Stop pumps before checking again.
    stopAllPumps();

    readSensors();

    Serial.printf(
      "RECHECK -> LEFT %d%% | RIGHT %d%%\n",
      leftSoil,
      rightSoil
    );
  }

  stopAllPumps();

  if (
    leftSoil >= SOIL_LOW_THRESHOLD &&
    rightSoil >= SOIL_LOW_THRESHOLD
  ) {
    statusText =
      "Both soils OK - pumps OFF";
  }

  Serial.println(statusText);

  logEverything();

  // ----------------------------------------------------------
  // Raise both probes
  // ----------------------------------------------------------

  probesUp();

  statusText =
    "Both probes UP";

  Serial.println(statusText);

  waitMs(500);

  // ----------------------------------------------------------
  // Leave the station
  // ----------------------------------------------------------

  motorsForward();

  statusText =
    "Leaving plant station";

  Serial.println(statusText);

  waitMs(LEAVE_STATION_MS);

  motorsStop();

  // Keep the station locked until the IR marker is physically cleared.
  // This prevents the same marker from triggering the watering cycle again.
  statusText =
    "Ready for next plant marker";

  plantPosition = "NONE";

  Serial.println(statusText);

  logEverything();
}

// ============================================================
// Setup
// ============================================================

void setup() {
  Serial.begin(115200);

  // ----------------------------------------------------------
  // L298N
  // ----------------------------------------------------------

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // ----------------------------------------------------------
  // Ultrasonic
  // ----------------------------------------------------------

  pinMode(TRIG_LEFT, OUTPUT);
  pinMode(ECHO_LEFT, INPUT);

  pinMode(TRIG_RIGHT, OUTPUT);
  pinMode(ECHO_RIGHT, INPUT);

  // ----------------------------------------------------------
  // IR
  // ----------------------------------------------------------

  pinMode(
    IR_POSITION_PIN,
    INPUT
  );

  // ----------------------------------------------------------
  // Soil
  // ----------------------------------------------------------

  pinMode(
    SOIL_LEFT_PIN,
    INPUT
  );

  pinMode(
    SOIL_RIGHT_PIN,
    INPUT
  );

  // ----------------------------------------------------------
  // Relays
  // ----------------------------------------------------------

  pinMode(
    RELAY_LEFT,
    OUTPUT
  );

  pinMode(
    RELAY_RIGHT,
    OUTPUT
  );

  stopAllPumps();

  // ----------------------------------------------------------
  // DHT22
  // ----------------------------------------------------------

  dht.begin();

  // ----------------------------------------------------------
  // Servos
  // ----------------------------------------------------------

  leftProbeServo.setPeriodHertz(50);
  rightProbeServo.setPeriodHertz(50);

  leftProbeServo.attach(
    SERVO_LEFT_PIN,
    500,
    2400
  );

  rightProbeServo.attach(
    SERVO_RIGHT_PIN,
    500,
    2400
  );

  probesUp();

  // ----------------------------------------------------------
  // Motor PWM
  // ----------------------------------------------------------

  ledcAttach(
    ENA,
    PWM_FREQ,
    PWM_RES
  );

  ledcAttach(
    ENB,
    PWM_FREQ,
    PWM_RES
  );

  motorsStop();

  // ----------------------------------------------------------
  // WiFi
  // ----------------------------------------------------------

  WiFi.mode(WIFI_STA);

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASS
  );

  Serial.print(
    "Connecting WiFi"
  );

  int attempts = 0;

  while (
    WiFi.status() != WL_CONNECTED &&
    attempts < 60
  ) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  Serial.println();

  if (
    WiFi.status() == WL_CONNECTED
  ) {
    Serial.print(
      "WiFi connected. Dashboard: http://"
    );

    Serial.println(
      WiFi.localIP()
    );
  } else {
    Serial.println(
      "WiFi failed - local robot mode"
    );
  }

  // ----------------------------------------------------------
  // Web server
  // ----------------------------------------------------------

  server.on(
    "/",
    handleRoot
  );

  server.begin();

  // ----------------------------------------------------------
  // Startup safety delay
  // ----------------------------------------------------------

  statusText =
    "Starting - STOP 3 sec";

  Serial.println(statusText);

  waitMs(
    START_DELAY_MS
  );

  // ----------------------------------------------------------
  // Initial readings
  // ----------------------------------------------------------

  readSensors();

  statusText =
    "System ready - moving";

  Serial.println(statusText);

  logEverything();
}

// ============================================================
// Loop
// ============================================================

void loop() {
  server.handleClient();

  // ----------------------------------------------------------
  // IR marker = plant station
  // IMPORTANT:
  // Check the station marker BEFORE ultrasonic obstacle logic.
  // A plant may be close enough to appear as an ultrasonic
  // obstacle, but the IR marker tells us this is a service stop.
  // ----------------------------------------------------------

  bool marker =
    plantMarkerDetected();

  // Unlock only after the robot has physically left the marker.
  // This creates a LOW -> HIGH -> LOW trigger cycle instead of
  // repeatedly servicing the same station.
  if (!marker && stationLock) {
    stationLock = false;
  }

  if (
    marker &&
    !stationLock
  ) {
    stationLock = true;

    plantPosition =
      "LEFT + RIGHT";

    servicePlants();

    return;
  }

  // ----------------------------------------------------------
  // Read ultrasonic sensors
  // ----------------------------------------------------------

  leftDistance =
    readUltrasonic(
      TRIG_LEFT,
      ECHO_LEFT
    );

  rightDistance =
    readUltrasonic(
      TRIG_RIGHT,
      ECHO_RIGHT
    );

  // ----------------------------------------------------------
  // Obstacle detection
  // Ultrasonic does NOT identify rock vs plant.
  // Any object closer than the safety distance stops robot.
  // ----------------------------------------------------------

  bool leftObstacle =
    leftDistance > 0 &&
    leftDistance < STOP_DISTANCE_CM;

  bool rightObstacle =
    rightDistance > 0 &&
    rightDistance < STOP_DISTANCE_CM;

  if (
    leftObstacle ||
    rightObstacle
  ) {
    motorsStop();
    stopAllPumps();

    statusText =
      "OBSTACLE - STOPPED";

    Serial.println(
      "!!! OBSTACLE DETECTED !!!"
    );

    Serial.printf(
      "LEFT %ld cm | RIGHT %ld cm\n",
      leftDistance,
      rightDistance
    );

    logEverything();

    // Stay stopped until obstacle is removed.
    delay(100);
    return;
  }

  // ----------------------------------------------------------
  // Normal movement
  // ----------------------------------------------------------

  motorsForward();

  statusText =
    "Moving - searching plant marker";

  delay(100);
}
