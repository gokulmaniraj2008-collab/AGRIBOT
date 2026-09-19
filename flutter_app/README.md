# AGRIBOT Flutter App

Dart/Flutter mobile dashboard for the AGRIBOT ESP32 + Supabase system.

Features:
- Live sensor dashboard
- Devices page
- No "Disconnected" badge/text
- Robot process visualization
- Sensor history
- 5-second polling
- Uses public agribot_sensor_data table
- Does not use deleted AGRIBOT tables

Setup:

    cd flutter_app
    flutter create .
    flutter pub get

Run:

    flutter run --dart-define=SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY

The Supabase URL is already configured for this AGRIBOT project. Use only the public publishable/anon key in the mobile app. Never put a Supabase secret/service-role key in the app.

Supabase Flutter stable package: 2.17.2.
