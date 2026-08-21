/*
  ESP32 + TB6612FNG WiFi-controlled robot car
  Control: local WiFi web server, connect from any browser on same network

  WIRING (double-check against YOUR board's pin labels before powering on):
  ESP32 pin   -> TB6612FNG pin
  GPIO27      -> AIN1
  GPIO26      -> AIN2
  GPIO25      -> PWMA
  GPIO33      -> BIN1
  GPIO32      -> BIN2
  GPIO14      -> PWMB
  GPIO13      -> STBY   (must be HIGH for driver to output anything)
  GND         -> GND (common ground between ESP32, TB6612FNG, and motor battery)
  3.3V or 5V  -> VCC (logic supply, check your TB6612FNG breakout's rating)

  Motor battery (e.g. 2S/3S Li-ion or 4xAA) -> VM + GND on TB6612FNG
  Do NOT power motors from the ESP32's 3.3V/5V pin — separate battery required.
  Motor A output (AO1/AO2) -> left motor
  Motor B output (BO1/BO2) -> right motor

  NOTE ON PWM: this uses the classic ESP32 Arduino core's ledc functions
  (ledcSetup / ledcAttachPin / ledcWrite). If you're on ESP32 Arduino core 3.x,
  these calls changed signature — let me know your core version if it fails
  to compile and I'll adjust.
*/

#include <WiFi.h>
#include <WebServer.h>

// ---- WiFi credentials: fill these in ----
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// ---- Motor pins ----
const int AIN1 = 27;
const int AIN2 = 26;
const int PWMA = 25;
const int BIN1 = 33;
const int BIN2 = 32;
const int PWMB = 14;
const int STBY = 13;

// ---- PWM (ledc) config ----
const int PWM_FREQ = 5000;
const int PWM_RES  = 8;      // 8-bit -> 0-255
const int CH_A = 0;
const int CH_B = 1;

int currentSpeed = 200;      // default speed, 0-255

WebServer server(80);

void stopMotors() {
  digitalWrite(AIN1, LOW);
  digitalWrite(AIN2, LOW);
  digitalWrite(BIN1, LOW);
  digitalWrite(BIN2, LOW);
  ledcWrite(CH_A, 0);
  ledcWrite(CH_B, 0);
}

void driveMotors(bool aForward, bool bForward, bool aOn, bool bOn) {
  digitalWrite(AIN1, aOn ? (aForward ? HIGH : LOW) : LOW);
  digitalWrite(AIN2, aOn ? (aForward ? LOW : HIGH) : LOW);
  digitalWrite(BIN1, bOn ? (bForward ? HIGH : LOW) : LOW);
  digitalWrite(BIN2, bOn ? (bForward ? LOW : HIGH) : LOW);
  ledcWrite(CH_A, aOn ? currentSpeed : 0);
  ledcWrite(CH_B, bOn ? currentSpeed : 0);
}

const char* htmlPage = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Robot Car Control</title>
  <style>
    body { font-family: sans-serif; text-align: center; background:#111; color:#eee; }
    button {
      width: 90px; height: 90px; margin: 6px; font-size: 16px;
      border-radius: 12px; border: none; background:#2563eb; color:white;
    }
    button:active { background:#1d4ed8; }
    #stop { background:#dc2626; }
    #stop:active { background:#b91c1c; }
    .row { display:flex; justify-content:center; }
    input[type=range] { width: 250px; }
  </style>
</head>
<body>
  <h2>Robot Car</h2>
  <div class="row"><button ontouchstart="cmd('forward')" onmousedown="cmd('forward')" ontouchend="cmd('stop')" onmouseup="cmd('stop')">Forward</button></div>
  <div class="row">
    <button ontouchstart="cmd('left')" onmousedown="cmd('left')" ontouchend="cmd('stop')" onmouseup="cmd('stop')">Left</button>
    <button id="stop" onclick="cmd('stop')">STOP</button>
    <button ontouchstart="cmd('right')" onmousedown="cmd('right')" ontouchend="cmd('stop')" onmouseup="cmd('stop')">Right</button>
  </div>
  <div class="row"><button ontouchstart="cmd('back')" onmousedown="cmd('back')" ontouchend="cmd('stop')" onmouseup="cmd('stop')">Back</button></div>
  <p>Speed: <span id="spdVal">200</span></p>
  <input type="range" min="0" max="255" value="200" oninput="setSpeed(this.value)">
  <script>
    function cmd(c) { fetch('/' + c); }
    function setSpeed(v) {
      document.getElementById('spdVal').innerText = v;
      fetch('/speed?value=' + v);
    }
  </script>
</body>
</html>
)rawliteral";

void setup() {
  Serial.begin(115200);

  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT);
  pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  digitalWrite(STBY, HIGH);   // enable driver

  ledcSetup(CH_A, PWM_FREQ, PWM_RES);
  ledcAttachPin(PWMA, CH_A);
  ledcSetup(CH_B, PWM_FREQ, PWM_RES);
  ledcAttachPin(PWMB, CH_B);

  stopMotors();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. IP address: ");
  Serial.println(WiFi.localIP());

  server.on("/", []() { server.send(200, "text/html", htmlPage); });
  server.on("/forward", []() { driveMotors(true, true, true, true); server.send(200, "text/plain", "OK"); });
  server.on("/back",    []() { driveMotors(false, false, true, true); server.send(200, "text/plain", "OK"); });
  server.on("/left",    []() { driveMotors(false, true, true, true); server.send(200, "text/plain", "OK"); });
  server.on("/right",   []() { driveMotors(true, false, true, true); server.send(200, "text/plain", "OK"); });
  server.on("/stop",    []() { stopMotors(); server.send(200, "text/plain", "OK"); });
  server.on("/speed",   []() {
    if (server.hasArg("value")) {
      currentSpeed = constrain(server.arg("value").toInt(), 0, 255);
    }
    server.send(200, "text/plain", "OK");
  });

  server.begin();
}

void loop() {
  server.handleClient();
}
