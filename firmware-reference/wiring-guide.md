# AGRIBOT Wiring Guide

Pin numbers below are taken directly from your `agribot_main.ino` (`#define` block), not guessed.

⚠️ **Golden rule: every module's GND must tie back to one common ground** — battery, ESP32, L298N, relay, sensors, buck converter. If grounds aren't shared, signals will read garbage or not at all.

---

## 1. Power distribution (do this first)

```
2× 18650 (series, 7.4V) ──► Fuse ──► ON/OFF Switch ──► splits into TWO paths:
```

**Path A — Motor/Pump power (raw battery voltage):**
- Battery+ (after switch) → L298N **12V/VMS** terminal
- Battery+ (after switch) → Relay **COM** terminal (pump circuit, see §4)
- Battery− → common ground bus

**Path B — Logic power (regulated 5V via buck converter):**
- Battery+ (after switch) → Buck converter **IN+**
- Battery− → Buck converter **IN−**
- Set buck converter output to **5V**
- Buck converter **OUT+** → ESP32 `5V`/`VIN` pin, DHT22 VCC, HC-SR04 VCC, SG90 VCC, GPS VCC, relay module VCC
- Buck converter **OUT−** → common ground bus

⚠️ If your L298N board has a "5V-EN" jumper enabling its onboard regulator, **remove/cut it**. Two live 5V sources tied together (L298N's regulator + your buck converter) will fight each other and can damage one or both.

Add a **100nF ceramic cap** across VCC/GND close to the DHT22, GPS module, and ESP32 power pins (noise suppression). Add a **100µF electrolytic** across the buck converter's output rail, and another across the raw battery input near the L298N — motors/pump cause voltage dips that can brown out the ESP32 otherwise.

---

## 2. L298N Motor Driver → ESP32

| L298N Pin | ESP32 GPIO |
|---|---|
| ENA | 14 |
| IN1 | 27 |
| IN2 | 26 |
| IN3 | 25 |
| IN4 | 33 |
| ENB | 32 |
| GND | common ground |

OUT1/OUT2 → Motor A, OUT3/OUT4 → Motor B. 12V/VMS → raw battery (see §1, Path A).

---

## 3. DHT22 Temperature/Humidity

| DHT22 Pin | Connects to |
|---|---|
| VCC | 5V (buck converter) |
| DATA | ESP32 GPIO 4 |
| GND | common ground |

Add a 10kΩ pull-up resistor (from your kit) between DATA and VCC if your module doesn't already have one built in (most breakout boards do — check for a resistor already on the small PCB).

---

## 4. Soil Moisture Sensor

| Sensor Pin | Connects to |
|---|---|
| VCC | 5V (buck converter) |
| AO (analog out) | ESP32 GPIO 35 |
| GND | common ground |

GPIO35 is input-only, ADC1 — correct choice, don't change it.

---

## 5. HC-SR04 Ultrasonic — needs a voltage divider on Echo

| HC-SR04 Pin | Connects to |
|---|---|
| VCC | 5V (buck converter) |
| Trig | ESP32 GPIO 18 (direct — this is an output from ESP32, 3.3V logic, safe) |
| Echo | **through voltage divider** → ESP32 GPIO 19 |
| GND | common ground |

**Echo divider (using your resistor kit):** Echo → 1kΩ → GPIO19 node → 1kΩ+1kΩ in series (=2kΩ) → GND.
This gives ⅔ × 5V ≈ 3.3V at GPIO19 — safe for the ESP32 input.

```
Echo ──[1kΩ]──┬── GPIO19
              │
           [2kΩ]  (two 1kΩ in series)
              │
             GND
```

---

## 6. Relay Module → 12V Water Pump

| Relay Pin | Connects to |
|---|---|
| VCC | 5V (buck converter) |
| IN | ESP32 GPIO 23 |
| GND | common ground |
| COM | Battery+ (raw, after switch/fuse) |
| NO (normally open) | Pump+ |

Pump− → Battery−/common ground.

**Add a 1N4007 diode across the pump's two terminals** (cathode/stripe to pump+), reverse-biased. DC pump motors generate a voltage spike (back-EMF) when switched off — this diode protects the relay contacts and nearby electronics from that spike.

⚠️ This is the same pump-voltage issue flagged above — a 12V pump on a 7.4V battery will underperform. Consider a separate boost converter dedicated to the pump line if full pump pressure matters, or swap to a 6–7.4V-rated pump.

---

## 7. Status LEDs

| LED | ESP32 GPIO | Resistor |
|---|---|---|
| WiFi status | GPIO 21 | 220Ω in series |
| Pump status | GPIO 22 | 220Ω in series |

LED long leg (anode) → GPIO through the 220Ω resistor. Short leg (cathode) → common ground.

---

## 8. SG90 Servo (probe arm)

| Servo Wire | Connects to |
|---|---|
| Red (VCC) | 5V (buck converter) — **not** ESP32 3.3V pin |
| Brown/Black (GND) | common ground |
| Orange/Yellow (signal) | ESP32 GPIO 15 |

---

## 9. GPS Module (NEO-6M)

Cross-wired — this is the #1 mistake people make with GPS modules:

| NEO-6M Pin | Connects to |
|---|---|
| VCC | 5V (buck converter) |
| TX | ESP32 GPIO **16** (ESP32's RX) |
| RX | ESP32 GPIO **17** (ESP32's TX) |
| GND | common ground |

(GPS TX → ESP32 RX, GPS RX → ESP32 TX — not straight-through.)

---

## 10. ESP32-CAM — separate device, don't wire it to the main ESP32

Your repo has a dedicated `esp32cam_supabase_upload.ino`, meaning the ESP32-CAM is meant to run as an **independent device** — its own WiFi connection, uploading images to Supabase directly, not talking to the main ESP32 over GPIO.

- Give it its **own** 5V supply, ideally its own dedicated tap off the buck converter (or a second small buck converter). The camera draws current spikes during capture/upload that can brown out a shared 5V rail feeding the main ESP32 too.
- Programming it requires a separate **USB-TTL (FTDI) adapter** — the ESP32-CAM has no onboard USB. GPIO0 → GND during flashing, then removed to run normally.
- If you did intend to wire it to the main ESP32 instead (e.g., trigger capture on command), let me know — that's a different, more involved setup (UART or a shared trigger GPIO), and isn't what your current firmware does.

---

## 11. Not wiring-related — flagging so nothing's missed

Domain+GST, soldering kit, stationery, and "Break" from your list are non-electrical/admin items — no wiring content for these, just noting I didn't skip them by accident.

---

## Before you power anything on

- [ ] Confirm battery is actually 2S (7.4V) or 3S (11.1V) — update `BATTERY_MAX_V`/`BATTERY_MIN_V` in firmware to match
- [ ] Confirm pump voltage vs. battery voltage — add boost converter if needed
- [ ] Remove the L298N onboard 5V regulator jumper if using the buck converter
- [ ] Build the Echo voltage divider before connecting HC-SR04
- [ ] Double-check GPS TX/RX are crossed, not straight-through
- [ ] Every module's GND is on the same common ground bus
- [ ] Rotate the exposed `service_role` Supabase key before deploying (flagged earlier — separate from wiring, but don't ship with it live)
