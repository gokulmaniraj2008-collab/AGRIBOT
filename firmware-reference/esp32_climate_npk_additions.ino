  /* ============================================================
   AgriBot ESP32 — Additions for Irrigation actuator control.

   Merge this into your existing ESP32 sketch, which already
   has WiFi, SUPABASE_URL, SERVICE_ROLE_KEY, ROBOT_ID, and the
   main sensor/command loop.
   ============================================================ */

// ---- Update robot_status with actuator state ----

void patchRobotStatus(JsonDocument& fields) {
  String payload;
  serializeJson(fields, payload);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/robot_status?robot_id=eq." + ROBOT_ID);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SERVICE_ROLE_KEY);
  http.addHeader("Prefer", "return=minimal");
  http.sendRequest("PATCH", payload);
  http.end();
}

// ---- Handle the new commands (add alongside your existing forward/pump_on/etc. cases) ----

void handleCommand(const String& command, float value) {
  StaticJsonDocument<128> patch;

  if (command == "set_irrigation_auto_on")  patch["irrigation_auto"] = true;
  else if (command == "set_irrigation_auto_off") patch["irrigation_auto"] = false;
  else if (command == "set_irrigation_threshold") patch["irrigation_threshold"] = value;

  else return; // not one of the new commands — fall through to your existing handler

  if (patch.size() > 0) patchRobotStatus(patch);
}

/* ============================================================
   Auto-mode logic — run every sensor cycle if irrigation_auto
   is true, so the robot reacts without waiting for a dashboard
   command.
   ============================================================ */

void runAutoLogic(float soilMoisture, bool irrigationAuto, float irrigationThreshold) {
  if (irrigationAuto && soilMoisture < irrigationThreshold) {
    // trigger pump the same way pump_on does
  }
}
