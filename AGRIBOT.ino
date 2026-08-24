// ================= AGRIBOT - FULL SYSTEM =================
// Motors + Servo + Ultrasonic + DHT22 + Soil Moisture + GPS + 12V Relay Motor
// ESP32 connects TO your phone's hotspot "AGRIBOT_WIFI"
// ============================================================

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

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
const char* ssid = "AGRIBOT_WIFI";
const char* password = "12345678";

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
}

void moveForward() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, SPEED_FORWARD); ledcWrite(ENB, SPEED_FORWARD);
  movingForward = true;
}

void moveReverse() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  ledcWrite(ENA, SPEED_REVERSE); ledcWrite(ENB, SPEED_REVERSE);
  movingForward = false;
}

void turnLeft() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, SPEED_FORWARD); ledcWrite(ENB, SPEED_FORWARD);
  movingForward = false;
}

void turnRight() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  ledcWrite(ENA, SPEED_FORWARD); ledcWrite(ENB, SPEED_FORWARD);
  movingForward = false;
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
}
