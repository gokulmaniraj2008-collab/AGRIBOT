// AGRIBOT - ESP32 cloud-connected firmware
// ESP32 -> Next.js device API -> Supabase
// Hardware: L298N, HC-SR04, servo, soil moisture, DHT22, relay/pump.
//
// SECURITY: do NOT put a Supabase service_role/secret key in this firmware.
// Set AGRIBOT_API_URL to your deployed Next.js /api/device endpoint and
// AGRIBOT_DEVICE_TOKEN to the matching Vercel environment variable.

#include <ESP32Servo.h>
#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "AGRIBOT_WIFI";
const char* WIFI_PASS = "12345678";
const char* AGRIBOT_API_URL = "https://YOUR-AGRIBOT-DOMAIN.vercel.app/api/device";
const char* DEVICE_TOKEN = "CHANGE_ME";
const char* ROBOT_ID = "agribot-01";

#define IN1 27
#define IN2 26
#define ENA 25
#define IN3 33
#define IN4 32
#define ENB 14

#define TRIG_PIN 5
#define ECHO_PIN 18
#define SERVO_PIN 13
#define SOIL_PIN 34
#define DHT_PIN 15
#define RELAY_PIN 4

#define DHT_TYPE DHT22
#define RELAY_ON LOW
#define RELAY_OFF HIGH
#define STOP_DISTANCE_CM 15
#define SOIL_LOW_THRESHOLD 30
#define MOTOR_SPEED 200
#define PWM_FREQ 5000
#define PWM_RES 8

DHT dht(DHT_PIN, DHT_TYPE);
Servo soilServo;

enum RobotMode { MODE_MANUAL, MODE_AUTO };
enum MotorState { MOTOR_STOPPED, MOTOR_FORWARD, MOTOR_BACKWARD, MOTOR_LEFT, MOTOR_RIGHT };

RobotMode mode = MODE_AUTO;
MotorState motorState = MOTOR_STOPPED;

bool pumpOn = false;
bool irrigationAuto = true;
bool safetyStopped = false;
int motorSpeed = MOTOR_SPEED;
int servoAngle = 0;
int soilMoisture = 0;
long distanceCm = -1;
float temperature = 0;
float humidity = 0;
String lastFault = "";
unsigned long lastTelemetry = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastSensorRead = 0;

String motorStateName() {
  switch (motorState) {
    case MOTOR_FORWARD: return "forward";
    case MOTOR_BACKWARD: return "backward";
    case MOTOR_LEFT: return "left";
    case MOTOR_RIGHT: return "right";
    default: return "stopped";
  }
}

void stopMotors() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0); ledcWrite(ENB, 0);
  motorState = MOTOR_STOPPED;
}

void setMotors(bool a1, bool a2, bool b1, bool b2, MotorState state) {
  digitalWrite(IN1, a1); digitalWrite(IN2, a2);
  digitalWrite(IN3, b1); digitalWrite(IN4, b2);
  ledcWrite(ENA, motorSpeed); ledcWrite(ENB, motorSpeed);
  motorState = state;
}

void moveForward() { setMotors(HIGH, LOW, HIGH, LOW, MOTOR_FORWARD); }
void moveBackward() { setMotors(LOW, HIGH, LOW, HIGH, MOTOR_BACKWARD); }
void turnLeft() { setMotors(LOW, HIGH, HIGH, LOW, MOTOR_LEFT); }
void turnRight() { setMotors(HIGH, LOW, LOW, HIGH, MOTOR_RIGHT); }

long readDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  return duration == 0 ? -1 : (long)(duration * 0.0343f / 2.0f);
}

int readSoil() {
  int raw = analogRead(SOIL_PIN);
  int pct = map(raw, 4095, 1200, 0, 100);
  return constrain(pct, 0, 100);
}

void readSensors() {
  distanceCm = readDistance();
  soilMoisture = readSoil();
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) temperature = t;
  if (!isnan(h)) humidity = h;
}

void pump(bool on) {
  pumpOn = on;
  digitalWrite(RELAY_PIN, on ? RELAY_ON : RELAY_OFF);
}

void jsonEscapeAppend(String& out, const String& value) {
  String s = value;
  s.replace("\\", "\\\\");
  s.replace(""", "\\"");
  out += s;
}

bool postJson(const String& url, const String& payload) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-agribot-device-token", DEVICE_TOKEN);
  int code = http.POST(payload);
  http.end();
  return code >= 200 && code < 300;
}

bool sendTelemetry() {
  String payload = "{";
  payload += "\"robot_id\":\""; payload += ROBOT_ID; payload += "\",";
  payload += "\"soil_moisture\":"; payload += soilMoisture; payload += ",";
  payload += "\"temperature\":"; payload += String(temperature, 1); payload += ",";
  payload += "\"humidity\":"; payload += String(humidity, 1); payload += ",";
  payload += "\"distance_cm\":"; payload += distanceCm; payload += ",";
  payload += "\"pump_status\":"; payload += pumpOn ? "true" : "false"; payload += ",";
  payload += "\"motor_state\":\""; payload += motorStateName(); payload += "\",";
  payload += "\"mode\":\""; payload += mode == MODE_AUTO ? "auto" : "manual"; payload += "\",";
  payload += "\"speed_value\":"; payload += motorSpeed; payload += ",";
  payload += "\"irrigation_auto\":"; payload += irrigationAuto ? "true" : "false"; payload += ",";
  payload += "\"irrigation_threshold\":"; payload += SOIL_LOW_THRESHOLD; payload += ",";
  payload += "\"safety_stopped\":"; payload += safetyStopped ? "true" : "false";
  payload += "}";
  return postJson(String(AGRIBOT_API_URL) + "/telemetry", payload);
}

void executeCommand(int id, const String& command, float value) {
  if (command == "forward") moveForward();
  else if (command == "backward") moveBackward();
  else if (command == "left") turnLeft();
  else if (command == "right") turnRight();
  else if (command == "stop") { safetyStopped = true; stopMotors(); pump(false); }
  else if (command == "pump_on") pump(true);
  else if (command == "pump_off") pump(false);
  else if (command == "set_speed") motorSpeed = constrain((int)value, 0, 255);
  else if (command == "set_servo_angle") { servoAngle = constrain((int)value, 0, 180); soilServo.write(servoAngle); }
  else if (command == "set_mode_auto") { mode = MODE_AUTO; safetyStopped = false; }
  else if (command == "set_mode_manual") mode = MODE_MANUAL;
  else if (command == "set_irrigation_auto_on") irrigationAuto = true;
  else if (command == "set_irrigation_auto_off") irrigationAuto = false;
  else if (command == "set_irrigation_threshold") {}
  else if (command == "safety_reset") { safetyStopped = false; stopMotors(); pump(false); }
  else if (command == "start_mission") { mode = MODE_AUTO; safetyStopped = false; }
  else if (command == "cancel_mission") { stopMotors(); pump(false); safetyStopped = true; }

  String ack = "{\"id\":" + String(id) + "}";
  postJson(String(AGRIBOT_API_URL) + "/commands", ack);
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(AGRIBOT_API_URL) + "/commands");
  http.addHeader("x-agribot-device-token", DEVICE_TOKEN);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  String body = http.getString();
  http.end();

  int idPos = body.indexOf("\"id\":");
  int cmdPos = body.indexOf("\"command\":\"");
  if (idPos < 0 || cmdPos < 0 || body.indexOf("null") >= 0) return;

  int idStart = idPos + 5;
  int idEnd = body.indexOf(",", idStart);
  int id = body.substring(idStart, idEnd).toInt();

  int cmdStart = cmdPos + 11;
  int cmdEnd = body.indexOf("\"", cmdStart);
  String command = body.substring(cmdStart, cmdEnd);

  float value = 0;
  int valuePos = body.indexOf("\"value\":");
  if (valuePos >= 0) value = body.substring(valuePos + 8).toFloat();

  executeCommand(id, command, value);
}

void automaticControl() {
  if (mode != MODE_AUTO || safetyStopped) return;

  if (distanceCm != -1 && distanceCm < STOP_DISTANCE_CM) {
    stopMotors();
    if (irrigationAuto && soilMoisture < SOIL_LOW_THRESHOLD) {
      pump(true);
      delay(1500);
      pump(false);
      readSensors();
    }
    return;
  }

  if (irrigationAuto && soilMoisture < SOIL_LOW_THRESHOLD) {
    pump(true);
  } else {
    pump(false);
  }

  moveForward();
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) delay(250);
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);

  dht.begin();
  soilServo.setPeriodHertz(50);
  soilServo.attach(SERVO_PIN, 500, 2400);
  soilServo.write(0);

  ledcAttach(ENA, PWM_FREQ, PWM_RES);
  ledcAttach(ENB, PWM_FREQ, PWM_RES);
  stopMotors();

  connectWiFi();
  readSensors();
}

void loop() {
  connectWiFi();

  if (millis() - lastSensorRead >= 1000) {
    lastSensorRead = millis();
    readSensors();
  }

  if (millis() - lastCommandPoll >= 1500) {
    lastCommandPoll = millis();
    pollCommands();
  }

  automaticControl();

  if (millis() - lastTelemetry >= 3000) {
    lastTelemetry = millis();
    sendTelemetry();
  }

  delay(20);
}
