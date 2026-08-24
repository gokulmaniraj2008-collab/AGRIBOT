// ================= AGRIBOT - FULL SYSTEM =================
// Motors + Servo + Ultrasonic + DHT22 + Soil Moisture + GPS + 12V Relay Motor
// ESP32 connects TO your phone's hotspot "AGRIBOT_WIFI"
// Also pushes telemetry to / polls commands from Supabase
// (see "Supabase config" below and the README's
// "How the ESP32 talks to this" section for the intended design)
// ============================================================

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>  // install "ArduinoJson" by Benoit Blanchon via Library Manager

// ---------- Motor A (left pair) ----------
#define IN1 27
#define IN2 26
#define ENA 25

// ---------- Motor B (right pair) ----------
#define IN3 33
#define IN4 32
#define ENB 14

// ---------- Servo ----------
#define SERVO_PIN 13

// ---------- Ultrasonic HC-SR04 ----------
#define TRIG_PIN 5
#define ECHO_PIN 18

// ---------- DHT22 ----------
#define DHT_PIN 4
#define DHT_TYPE DHT22

// ---------- Soil moisture (analog, ADC1 pin only) ----------
#define SOIL_PIN 34

// ---------- GPS (UART2) ----------
#define GPS_RX 16
#define GPS_TX 17
#define GPS_BAUD 9600

// ---------- 12V Motor Relay ----------
#define RELAY_PIN 23
#define RELAY_ACTIVE_LOW true   // change to false if your relay logic is reversed

#define PWM_FREQ 5000
#define PWM_RES  8
#define SPEED_FORWARD 130
#define SPEED_REVERSE 110
#define OBSTACLE_DISTANCE_CM 15

// ---------- WiFi (your phone hotspot) ----------
// NOTE: this hotspot needs actual internet access (mobile data sharing
// turned on) for the Supabase calls below to work — a phone hotspot with
// data sharing off only gives the ESP32 a local network, no internet.
const char* ssid = "AGRIBOT_WIFI";
const char* password = "12345678";

// ---------- Supabase ----------
// Project URL + service_role key from Supabase → Settings → API.
// service_role bypasses RLS, which is why it's safe to use directly from
// the firmware per this project's schema/RLS design (see migrations
// 0001_init.sql and 0008_device_messages.sql). Keep this key device-side
// only — never commit it to the repo or put it in the web app.
const char* SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const char* SUPABASE_SERVICE_KEY = "YOUR_SERVICE_ROLE_KEY";
const char* ROBOT_ID = "agribot-01";

const unsigned long TELEMETRY_INTERVAL_MS = 5000;   // sensor_data + robot_status
const unsigned long COMMAND_POLL_INTERVAL_MS = 1500; // robot_commands
unsigned long lastTelemetry = 0;
unsigned long lastCommandPoll = 0;

// Mirrors robot_status.motor_state's allowed values exactly
String motorState = "stopped";

WebServer server(80);
Servo myServo;
DHT dht(DHT_PIN, DHT_TYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

int servoAngle = 90;
long lastDistance = 0;
float lastTemp = 0;
float lastHumidity = 0;
int lastSoilRaw = 0;
int lastSoilPercent = 0;
double lastLat = 0;
double lastLng = 0;
int lastSatellites = 0;
bool gpsFixValid = false;
bool relayOn = false;

unsigned long lastUltrasonicRead = 0;
unsigned long lastDhtRead = 0;
unsigned long lastSoilRead = 0;
bool movingForward = false;

// ================= MOTOR FUNCTIONS =================
void stopMotors() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0); ledcWrite(ENB, 0);
  movingForward = false;
  motorState = "stopped";
}

void moveForward() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, SPEED_FORWARD); ledcWrite(ENB, SPEED_FORWARD);
  movingForward = true;
  motorState = "forward";
}

void moveReverse() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  ledcWrite(ENA, SPEED_REVERSE); ledcWrite(ENB, SPEED_REVERSE);
  movingForward = false;
  motorState = "backward";
}

void turnLeft() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, SPEED_FORWARD); ledcWrite(ENB, SPEED_FORWARD);
  movingForward = false;
  motorState = "left";
}

void turnRight() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  ledcWrite(ENA, SPEED_FORWARD); ledcWrite(ENB, SPEED_FORWARD);
  movingForward = false;
  motorState = "right";
}

// ================= RELAY (12V MOTOR) =================
void relayOnFunc() {
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? LOW : HIGH);
  relayOn = true;
}

void relayOffFunc() {
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW);
  relayOn = false;
}

// ================= ULTRASONIC =================
long readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1;
  return duration * 0.0343 / 2;
}

// ================= SUPABASE (PostgREST over HTTPS) =================
// setInsecure() skips TLS certificate validation. That's the common
// approach for ESP32 sketches talking to Supabase (managing/updating a
// root CA on-device is a hassle and Supabase rotates its certs), but it
// does mean the connection isn't verified against a trusted CA. Fine for
// a prototype; for production consider pinning Supabase's root CA instead.
bool supabaseRequest(const String& method, const String& path, const String& body, String& response) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + path;
  if (!http.begin(client, url)) return false;

  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  http.addHeader("Content-Type", "application/json");
  if (method == "UPSERT") {
    http.addHeader("Prefer", "resolution=merge-duplicates,return=minimal");
  } else if (method == "POST" || method == "PATCH") {
    http.addHeader("Prefer", "return=minimal");
  }

  String verb = (method == "UPSERT") ? "POST" : method;
  int code = http.sendRequest(verb.c_str(), (uint8_t*)body.c_str(), body.length());

  response = http.getString();
  bool ok = (code >= 200 && code < 300);
  if (!ok) {
    Serial.printf("Supabase %s %s -> HTTP %d: %s\n", verb.c_str(), path.c_str(), code, response.c_str());
  }
  http.end();
  return ok;
}

// Insert one row of live readings into sensor_data
void sendSensorData() {
  StaticJsonDocument<256> doc;
  doc["soil_moisture"] = lastSoilPercent;
  doc["temperature"] = lastTemp;
  doc["humidity"] = lastHumidity;
  doc["distance_cm"] = lastDistance;
  if (gpsFixValid) {
    doc["latitude"] = lastLat;
    doc["longitude"] = lastLng;
  }

  String body;
  serializeJson(doc, body);
  String resp;
  supabaseRequest("POST", "/rest/v1/sensor_data", body, resp);
}

// Upsert this robot's single robot_status row (heartbeat)
void upsertRobotStatus() {
  StaticJsonDocument<256> doc;
  doc["robot_id"] = ROBOT_ID;
  doc["online"] = true;
  doc["mode"] = "manual";
  doc["pump_status"] = relayOn;
  doc["motor_state"] = motorState;
  doc["speed_value"] = movingForward ? SPEED_FORWARD : 0;

  String body;
  serializeJson(doc, body);
  String resp;
  supabaseRequest("UPSERT", "/rest/v1/robot_status?on_conflict=robot_id", body, resp);
}

// Mark a robot_commands row as done so it isn't picked up again
void markCommandExecuted(long id) {
  if (id <= 0) return;
  String path = "/rest/v1/robot_commands?id=eq." + String(id);
  String resp;
  supabaseRequest("PATCH", path, "{\"executed\":true}", resp);
}

// Apply a command from the dashboard. This firmware only drives the
// motors and the relay (used here as the pump/12V motor output) — other
// commands in the dashboard's full command set (climate, irrigation
// thresholds, missions, GPS navigation, etc.) require hardware/firmware
// this sketch doesn't have yet, so they're acknowledged (marked
// executed) but otherwise ignored.
void executeRemoteCommand(const String& command, int value) {
  Serial.print("Supabase command: "); Serial.println(command);

  if (command == "forward") moveForward();
  else if (command == "backward") moveReverse();
  else if (command == "left") turnLeft();
  else if (command == "right") turnRight();
  else if (command == "stop") stopMotors();
  else if (command == "pump_on") relayOnFunc();
  else if (command == "pump_off") relayOffFunc();
  else if (command == "set_speed") {
    Serial.println("set_speed acknowledged - variable speed not implemented in this firmware yet");
  } else {
    Serial.println("Command not supported by this firmware - ignoring");
  }
}

// Poll robot_commands for unexecuted rows targeting this robot, run them,
// then mark each as executed.
void pollAndExecuteCommands() {
  String path = String("/rest/v1/robot_commands?robot_id=eq.") + ROBOT_ID +
                "&executed=eq.false&order=created_at.asc&limit=5";
  String resp;
  if (!supabaseRequest("GET", path, "", resp)) return;

  DynamicJsonDocument doc(2048);
  DeserializationError err = deserializeJson(doc, resp);
  if (err) {
    Serial.print("Command JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  for (JsonObject cmdRow : doc.as<JsonArray>()) {
    long id = cmdRow["id"] | 0L;
    const char* command = cmdRow["command"] | "";
    int value = cmdRow["value"] | -1;

    executeRemoteCommand(String(command), value);
    markCommandExecuted(id);
  }
}

// ================= WEB PAGE =================
const char htmlPage[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>AGRIBOT Control</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { text-align: center; font-family: Arial; background:#222; color:#fff; }
    button {
      width: 90px; height: 90px; margin: 8px; font-size: 18px;
      border-radius: 10px; border: none; background: #444; color: #fff;
    }
    button:active { background: #0a84ff; }
    .row { display: flex; justify-content: center; }
    .servo-box { margin-top: 30px; }
    input[type=range] { width: 80%; }
    .sensor-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
      max-width: 400px; margin: 20px auto;
    }
    .sensor-card {
      background: #333; border-radius: 10px; padding: 12px; font-size: 15px;
    }
    .full-width { grid-column: span 2; }
    .relay-box { margin-top: 25px; }
    .relay-btn {
      width: 180px; height: 60px; font-size: 18px; border-radius: 10px;
      border: none; color: #fff;
    }
    .relay-on { background: #2e7d32; }
    .relay-off { background: #a33; }
  </style>
</head>
<body>
  <h2>AGRIBOT Control</h2>

  <div class="sensor-grid">
    <div class="sensor-card">Distance<br><span id="distVal">--</span> cm</div>
    <div class="sensor-card">Temp<br><span id="tempVal">--</span> &deg;C</div>
    <div class="sensor-card">Humidity<br><span id="humVal">--</span> %</div>
    <div class="sensor-card">Soil Moisture<br><span id="soilVal">--</span> %</div>
    <div class="sensor-card full-width">
      GPS: <span id="gpsVal">Waiting for fix...</span><br>
      Satellites: <span id="satVal">0</span>
    </div>
  </div>

  <div class="row">
    <button ontouchstart="send('forward')" ontouchend="send('stop')"
            onmousedown="send('forward')" onmouseup="send('stop')">Forward</button>
  </div>
  <div class="row">
    <button ontouchstart="send('left')" ontouchend="send('stop')"
            onmousedown="send('left')" onmouseup="send('stop')">Left</button>
    <button onclick="send('stop')" style="background:#a33;">Stop</button>
    <button ontouchstart="send('right')" ontouchend="send('stop')"
            onmousedown="send('right')" onmouseup="send('stop')">Right</button>
  </div>
  <div class="row">
    <button ontouchstart="send('reverse')" ontouchend="send('stop')"
            onmousedown="send('reverse')" onmouseup="send('stop')">Reverse</button>
  </div>

  <div class="servo-box">
    <h3>Servo Angle: <span id="angleLabel">90</span>&deg;</h3>
    <input type="range" min="0" max="180" value="90" id="servoSlider"
           oninput="updateServo(this.value)">
    <br>
    <button onclick="setAngle(0)">0&deg;</button>
    <button onclick="setAngle(90)">90&deg;</button>
    <button onclick="setAngle(180)">180&deg;</button>
  </div>

  <div class="relay-box">
    <h3>12V Motor (Relay)</h3>
    <button id="relayBtn" class="relay-btn relay-off" onclick="toggleRelay()">Turn ON</button>
  </div>

  <script>
    let relayState = false;

    function send(cmd) { fetch('/' + cmd); }
    function updateServo(val) {
      document.getElementById('angleLabel').innerText = val;
      fetch('/servo?angle=' + val);
    }
    function setAngle(val) {
      document.getElementById('servoSlider').value = val;
      document.getElementById('angleLabel').innerText = val;
      fetch('/servo?angle=' + val);
    }
    function toggleRelay() {
      relayState = !relayState;
      fetch('/relay?state=' + (relayState ? '1' : '0'));
      const btn = document.getElementById('relayBtn');
      if (relayState) {
        btn.innerText = 'Turn OFF';
        btn.className = 'relay-btn relay-on';
      } else {
        btn.innerText = 'Turn ON';
        btn.className = 'relay-btn relay-off';
      }
    }
    function updateSensors() {
      fetch('/sensors')
        .then(res => res.json())
        .then(data => {
          document.getElementById('distVal').innerText = data.distance;
          document.getElementById('tempVal').innerText = data.temp;
          document.getElementById('humVal').innerText = data.humidity;
          document.getElementById('soilVal').innerText = data.soil;
          document.getElementById('satVal').innerText = data.sats;
          if (data.fix) {
            document.getElementById('gpsVal').innerText = data.lat + ', ' + data.lng;
          } else {
            document.getElementById('gpsVal').innerText = 'No fix yet';
          }
        });
    }
    setInterval(updateSensors, 1000);
  </script>
</body>
</html>
)rawliteral";

void handleRoot() {
  server.send(200, "text/html", htmlPage);
}

void handleServo() {
  if (server.hasArg("angle")) {
    servoAngle = constrain(server.arg("angle").toInt(), 0, 180);
    myServo.write(servoAngle);
  }
  server.send(200, "text/plain", "OK");
}

void handleRelay() {
  if (server.hasArg("state")) {
    int state = server.arg("state").toInt();
    if (state == 1) {
      relayOnFunc();
      Serial.println("Relay ON - 12V motor running");
    } else {
      relayOffFunc();
      Serial.println("Relay OFF - 12V motor stopped");
    }
  }
  server.send(200, "text/plain", "OK");
}

void handleSensors() {
  String json = "{";
  json += "\"distance\":" + String(lastDistance) + ",";
  json += "\"temp\":" + String(lastTemp, 1) + ",";
  json += "\"humidity\":" + String(lastHumidity, 1) + ",";
  json += "\"soil\":" + String(lastSoilPercent) + ",";
  json += "\"fix\":" + String(gpsFixValid ? "true" : "false") + ",";
  json += "\"lat\":" + String(lastLat, 6) + ",";
  json += "\"lng\":" + String(lastLng, 6) + ",";
  json += "\"sats\":" + String(lastSatellites) + ",";
  json += "\"relay\":" + String(relayOn ? "true" : "false");
  json += "}";
  server.send(200, "application/json", json);
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== AGRIBOT Booting ===");

  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);

  ledcAttach(ENA, PWM_FREQ, PWM_RES);
  ledcAttach(ENB, PWM_FREQ, PWM_RES);
  stopMotors();
  relayOffFunc();

  myServo.setPeriodHertz(50);
  myServo.attach(SERVO_PIN, 500, 2400);
  myServo.write(servoAngle);

  dht.begin();
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX, GPS_TX);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to "); Serial.print(ssid);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500); Serial.print("."); attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n>>> CONNECTED <<<");
    Serial.print("ESP32 IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n>>> FAILED TO CONNECT! Check SSID/password <<<");
  }

  server.on("/", handleRoot);
  server.on("/forward", []() { moveForward(); server.send(200, "text/plain", "OK"); });
  server.on("/reverse", []() { moveReverse(); server.send(200, "text/plain", "OK"); });
  server.on("/left",    []() { turnLeft();    server.send(200, "text/plain", "OK"); });
  server.on("/right",   []() { turnRight();   server.send(200, "text/plain", "OK"); });
  server.on("/stop",    []() { stopMotors();  server.send(200, "text/plain", "OK"); });
  server.on("/servo",   handleServo);
  server.on("/relay",   handleRelay);
  server.on("/sensors", handleSensors);

  server.begin();
  Serial.println("Web server started");
}

// ================= LOOP =================
void loop() {
  server.handleClient();

  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
  if (gps.location.isValid()) {
    lastLat = gps.location.lat();
    lastLng = gps.location.lng();
    gpsFixValid = true;
  }
  if (gps.satellites.isValid()) {
    lastSatellites = gps.satellites.value();
  }

  if (millis() - lastUltrasonicRead > 200) {
    lastUltrasonicRead = millis();
    long d = readDistanceCM();
    if (d > 0) lastDistance = d;

    if (movingForward && lastDistance > 0 && lastDistance < OBSTACLE_DISTANCE_CM) {
      stopMotors();
      Serial.println("!!! Obstacle detected - auto-stopped !!!");
    }
  }

  if (millis() - lastDhtRead > 2500) {
    lastDhtRead = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) lastTemp = t;
    if (!isnan(h)) lastHumidity = h;
  }

  if (millis() - lastSoilRead > 1000) {
    lastSoilRead = millis();
    lastSoilRaw = analogRead(SOIL_PIN);
    lastSoilPercent = map(lastSoilRaw, 2800, 1200, 0, 100);
    lastSoilPercent = constrain(lastSoilPercent, 0, 100);
  }

  // ---------- Supabase telemetry + command polling ----------
  if (millis() - lastTelemetry > TELEMETRY_INTERVAL_MS) {
    lastTelemetry = millis();
    sendSensorData();
    upsertRobotStatus();
  }

  if (millis() - lastCommandPoll > COMMAND_POLL_INTERVAL_MS) {
    lastCommandPoll = millis();
    pollAndExecuteCommands();
  }
}
