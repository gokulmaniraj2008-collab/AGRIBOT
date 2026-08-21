#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---- WiFi credentials ----
const char* ssid = "AGRIBOT_WIFI";
const char* password = "12345678";

// ---- Supabase ----
const char* supabaseUrl = "https://hvnasippwadzygnaodpp.supabase.co/rest/v1/car_commands?id=eq.1";
const char* apiKey = "sb_publishable_ZFFW9ifODSHTwOPlOBWhqw_G8H7FACO";

// ---- Motor driver pins (L298N) ----
#define IN1 25   // Left side direction
#define IN2 26
#define IN3 27   // Right side direction
#define IN4 14
#define ENA 33   // Left side speed (PWM)
#define ENB 32   // Right side speed (PWM)

void setup() {
  Serial.begin(115200);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected! IP: " + WiFi.localIP().toString());
}

void drive(String dir, int speed) {
  analogWrite(ENA, speed);
  analogWrite(ENB, speed);

  if (dir == "forward") {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  } else if (dir == "backward") {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  } else if (dir == "left") {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  } else if (dir == "right") {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  } else { // stop
    digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
    digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  }
}

void loop() {
  HTTPClient http;
  http.begin(supabaseUrl);
  http.addHeader("apikey", apiKey);
  http.addHeader("Authorization", String("Bearer ") + apiKey);

  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(512);
    deserializeJson(doc, payload);
    String dir = doc[0]["direction"];
    int speed = doc[0]["speed"];
    drive(dir, speed);
    Serial.println("dir=" + dir + " speed=" + String(speed));
  } else {
    Serial.println("HTTP error: " + String(code));
  }

  http.end();
  delay(300); // poll every 300ms
}
