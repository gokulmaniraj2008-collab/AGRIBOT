import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const url = String.fromEnvironment('SUPABASE_URL', defaultValue: 'https://hvnasippwadzygnaodpp.supabase.co');
const key = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (key.isEmpty) {
    runApp(const MaterialApp(home: ConfigPage()));
    return;
  }
  await Supabase.initialize(url: url, publishableKey: key);
  runApp(const AgribotApp());
}

class ConfigPage extends StatelessWidget {
  const ConfigPage({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(child: Padding(
      padding: EdgeInsets.all(24),
      child: Text('Run with --dart-define=SUPABASE_PUBLISHABLE_KEY=YOUR_KEY'),
    )),
  );
}

class AgribotApp extends StatelessWidget {
  const AgribotApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'AGRIBOT',
    theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.green),
    home: const HomePage(),
  );
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final db = Supabase.instance.client;
  Timer? timer;
  List<Map<String, dynamic>> rows = [];
  int tab = 0;

  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 5), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final data = await db.from('agribot_sensor_data')
          .select()
          .order('created_at', ascending: false)
          .limit(50);
      if (mounted) setState(() => rows = List<Map<String, dynamic>>.from(data));
    } catch (_) {}
  }

  Map<String, dynamic>? get latest => rows.isEmpty ? null : rows.first;

  @override
  Widget build(BuildContext context) {
    final pages = [
      Dashboard(row: latest),
      Devices(row: latest),
      Process(row: latest),
      History(rows: rows),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('🌱 AGRIBOT'),
        actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh))],
      ),
      body: pages[tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (v) => setState(() => tab = v),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.memory), label: 'Devices'),
          NavigationDestination(icon: Icon(Icons.alt_route), label: 'Process'),
          NavigationDestination(icon: Icon(Icons.history), label: 'History'),
        ],
      ),
    );
  }
}

class Dashboard extends StatelessWidget {
  final Map<String, dynamic>? row;
  const Dashboard({super.key, required this.row});

  @override
  Widget build(BuildContext context) {
    if (row == null) return const Empty('Waiting for the ESP32 sensor reading.');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Live Sensor Data', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          children: [
            Metric('Soil', row!['soil_moisture'], '%', Icons.grass),
            Metric('Temperature', row!['temperature'], '°C', Icons.thermostat),
            Metric('Humidity', row!['humidity'], '%', Icons.water_drop),
            Metric('Distance', row!['distance_cm'], ' cm', Icons.radar),
            Metric('Battery', row!['battery_percent'], '%', Icons.battery_std),
            Metric('Pump', row!['relay'] == true ? 1 : 0, row!['relay'] == true ? 'ON' : 'OFF', Icons.water),
          ],
        ),
        const SizedBox(height: 12),
        Card(child: ListTile(
          title: const Text('Robot Status'),
          subtitle: Text((row!['status'] ?? 'No status').toString() + '\nMotor: ' + (row!['motor'] ?? '—').toString()),
        )),
      ],
    );
  }
}

class Devices extends StatelessWidget {
  final Map<String, dynamic>? row;
  const Devices({super.key, required this.row});

  @override
  Widget build(BuildContext context) {
    if (row == null) return const Empty('Waiting for AGRIBOT-01.');
    final created = DateTime.tryParse((row!['created_at'] ?? '').toString());
    final active = created != null && DateTime.now().difference(created.toLocal()).inSeconds < 30;
    final gps = row!['latitude'] != null && row!['longitude'] != null;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Connected Devices', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Device('AGRIBOT-01', 'ESP32 · Main controller', active, Icons.smart_toy),
        Device('GPS Module', gps ? 'Location available' : 'No GPS fix', active && gps, Icons.location_on),
        Device('Camera', 'ESP32-CAM', false, Icons.camera_alt),
        Device('Motor / Pump Controller', 'ESP32 control output', active, Icons.settings),
      ],
    );
  }
}

class Process extends StatelessWidget {
  final Map<String, dynamic>? row;
  const Process({super.key, required this.row});

  @override
  Widget build(BuildContext context) {
    const steps = [
      'POWER ON', 'ESP32 STARTS', 'STOP FOR 3 SEC', 'REVERSE / MOVE',
      'ULTRASONIC SENSOR', 'OBSTACLE < 15 CM?', 'MOTOR STOP',
      'SERVO → 90°', 'WAIT 5 SECONDS', 'READ SOIL MOISTURE',
      'SOIL < 30%?', 'PUMP ON / WATER 5 SEC', 'READ SOIL AGAIN',
      'PUMP OFF', 'SERVO → 0°', 'FORWARD 3 SEC', 'MOTOR STOP / DONE',
    ];
    final status = (row?['status'] ?? '').toString().toUpperCase();
    var active = 1;
    if (status.contains('REVERSE')) active = 3;
    if (status.contains('OBSTACLE')) active = 6;
    if (status.contains('WATER') || row?['relay'] == true) active = 11;
    if (status.contains('SOIL OK') || status.contains('PUMP OFF')) active = 13;
    if (status.contains('FORWARD')) active = 15;
    if (status.contains('DONE') || status.contains('FINAL')) active = 16;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Robot Process', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        for (var i = 0; i < steps.length; i++) ListTile(
          leading: CircleAvatar(
            backgroundColor: i <= active ? Colors.green : Colors.grey.shade300,
            child: Text((i + 1).toString()),
          ),
          title: Text(steps[i]),
          trailing: i < active ? const Icon(Icons.check, color: Colors.green) : null,
        ),
      ],
    );
  }
}

class History extends StatelessWidget {
  final List<Map<String, dynamic>> rows;
  const History({super.key, required this.rows});
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Text('Sensor History', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
      for (final r in rows) Card(child: ListTile(
        title: Text((r['soil_moisture'] ?? '—').toString() + '% soil · ' + (r['temperature'] ?? '—').toString() + '°C'),
        subtitle: Text((r['status'] ?? '—').toString() + '\n' + (r['created_at'] ?? '—').toString()),
      )),
    ],
  );
}

class Metric extends StatelessWidget {
  final String title, suffix;
  final dynamic number;
  final IconData icon;
  const Metric(this.title, this.number, this.suffix, this.icon, {super.key});
  @override
  Widget build(BuildContext context) {
    final value = number is num ? number.toStringAsFixed(1) + suffix : suffix;
    return Card(child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Icon(icon, color: Colors.green),
        Text(title),
        Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      ]),
    ));
  }
}

class Device extends StatelessWidget {
  final String title, subtitle;
  final bool connected;
  final IconData icon;
  const Device(this.title, this.subtitle, this.connected, this.icon, {super.key});
  @override
  Widget build(BuildContext context) => Card(child: ListTile(
    leading: CircleAvatar(child: Icon(icon)),
    title: Text(title),
    subtitle: Text(subtitle),
    trailing: connected ? const Chip(label: Text('Connected')) : null,
  ));
}

class Empty extends StatelessWidget {
  final String text;
  const Empty(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Center(child: Text(text));
}
