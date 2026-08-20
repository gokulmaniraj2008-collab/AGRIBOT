/*
  ESP32-CAM MINIMAL TEST SKETCH
  Board: AI Thinker ESP32-CAM

  Purpose: confirm the board flashes correctly and the serial link works,
  with zero dependency on the camera, WiFi, or Supabase. If this uploads
  and you see the LED blink + Serial output, your wiring/flash-mode
  process is good — any further errors belong to the camera code, not
  the hardware setup.

  Wiring reminder: GPIO0 -> GND only while flashing. After upload
  finishes, disconnect GPIO0 from GND and reset/power-cycle to run.

  GPIO2 drives the small red status LED on most AI-Thinker boards
  (separate from the bright white flash LED on GPIO4).
*/

#define STATUS_LED_PIN 2

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\nESP32-CAM TEST SKETCH starting...");
  pinMode(STATUS_LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(STATUS_LED_PIN, HIGH);
  Serial.println("LED ON");
  delay(500);

  digitalWrite(STATUS_LED_PIN, LOW);
  Serial.println("LED OFF");
  delay(500);
}
