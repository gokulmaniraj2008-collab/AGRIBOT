import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

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
  Widget build(BuildContext context) => Scaffold(
    body: Center(child: Padding(
      padding: EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Image.network('https://raw.githubusercontent.com/gokulmaniraj2008-collab/AGRIBOT/main/src/app/icon.png', width: 110, height: 110, fit: BoxFit.contain),
        const SizedBox(height: 18),
        const Text('AGRIBOT', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        const Text('Build configuration required', style: TextStyle(fontSize: 16)),
      ]),
    )),
  );
}

class AgribotApp extends StatelessWidget {
  const AgribotApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'AGRIBOT',
    theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF16A34A), scaffoldBackgroundColor: const Color(0xFFF8FAF9), cardTheme: const CardThemeData(elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))), surfaceTintColor: Colors.white), appBarTheme: const AppBarTheme(elevation: 0, backgroundColor: Colors.white, foregroundColor: Color(0xFF111827))),
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
      History(rows: rows),
      WebsitePage(page: 'profile', row: latest, rows: rows),
      WebsitePage(page: 'logs', row: latest, rows: rows),
      WebsitePage(page: 'device', row: latest, rows: rows),
      Farm(row: latest),
      WebsitePage(page: 'alerts', row: latest, rows: rows),
      WebsitePage(page: 'analytics', row: latest, rows: rows),
      WebsitePage(page: 'insights', row: latest, rows: rows),
      WebsitePage(page: 'assistant', row: latest, rows: rows),
      WebsitePage(page: 'recommendations', row: latest, rows: rows),
      WebsitePage(page: 'plants', row: latest, rows: rows),
      WebsitePage(page: 'camera', row: latest, rows: rows),
      Devices(row: latest),
      WebsitePage(page: 'welcome', row: latest, rows: rows),
      Process(row: latest),
    ];
    const names = [
      'Dashboard','History','Profile','Logs','Device','Field','Alerts','Analytics',
      'Insights','AI Assistant','Recommendations','Plants','Camera','Devices','Welcome','Process'
    ];
    const icons = [
      Icons.dashboard,Icons.history,Icons.person,Icons.article,Icons.smart_toy,Icons.map,
      Icons.notifications,Icons.analytics,Icons.lightbulb,Icons.auto_awesome,Icons.recommend,
      Icons.grass,Icons.camera_alt,Icons.memory,Icons.waving_hand,Icons.alt_route
    ];
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Image.network('https://raw.githubusercontent.com/gokulmaniraj2008-collab/AGRIBOT/main/src/app/icon.png', width: 34, height: 34, fit: BoxFit.contain),
          const SizedBox(width: 8),
          const Text('AGRIBOT'),
        ]),
        actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh)), const SizedBox(width: 8)],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: ListView(
            children: [
              const DrawerHeader(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('🌱 AGRIBOT', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                  SizedBox(height: 8),
                  Text('All website pages in the mobile app'),
                ]),
              ),
              for (var i = 0; i < names.length; i++)
                ListTile(
                  leading: Icon(icons[i]),
                  title: Text(names[i]),
                  selected: tab == i,
                  onTap: () {
                    Navigator.pop(context);
                    setState(() => tab = i);
                  },
                ),
            ],
          ),
        ),
      ),
      body: pages[tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab < 5 ? tab : 0,
        onDestinationSelected: (v) => setState(() => tab = [0, 13, 15, 5, 1][v]),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.memory), label: 'Devices'),
          NavigationDestination(icon: Icon(Icons.alt_route), label: 'Process'),
          NavigationDestination(icon: Icon(Icons.map), label: 'Field'),
          NavigationDestination(icon: Icon(Icons.history), label: 'History'),
        ],
      ),
    );
  }
}

class WebsitePage extends StatelessWidget {
  final String page;
  final Map<String, dynamic>? row;
  final List<Map<String, dynamic>> rows;
  const WebsitePage({super.key, required this.page, required this.row, required this.rows});

  String get title {
    const titles = {'profile':'Profile','logs':'Robot Logs','device':'Device','alerts':'Alerts','analytics':'Analytics','insights':'Insights','assistant':'AI Assistant','recommendations':'Recommendations','plants':'Plants','camera':'Camera','welcome':'Welcome'};
    return titles[page] ?? 'AGRIBOT';
  }

  IconData get icon {
    const icons = {'profile':Icons.person,'logs':Icons.article,'device':Icons.smart_toy,'alerts':Icons.notifications,'analytics':Icons.analytics,'insights':Icons.lightbulb,'assistant':Icons.auto_awesome,'recommendations':Icons.recommend,'plants':Icons.grass,'camera':Icons.camera_alt,'welcome':Icons.waving_hand};
    return icons[page] ?? Icons.dashboard;
  }

  @override
  Widget build(BuildContext context) {
    final cards = <Widget>[InfoCard(title:title, icon:icon, body:_description())];
    if (page == 'logs') {
      cards.addAll(rows.take(20).map((r) => InfoCard(title:(r['status'] ?? 'Sensor update').toString(), icon:Icons.event_note, body:(r['created_at'] ?? '—').toString() + '\nSoil: ' + (r['soil_moisture'] ?? '—').toString() + '%')));
    } else if (page == 'analytics') {
      cards.add(InfoCard(title:'Live readings', icon:Icons.data_usage, body:rows.length.toString() + ' sensor readings loaded from Supabase.'));
    } else if (page == 'alerts') {
      cards.add(InfoCard(title:'Current robot status', icon:Icons.notifications_active, body:row == null ? 'Waiting for sensor data.' : (row!['status'] ?? 'No active status').toString()));
    } else if (page == 'plants') {
      cards.addAll(const [InfoCard(title:'Plant zone 01',icon:Icons.location_on,body:'11.016950, 76.955850'),InfoCard(title:'Plant zone 02',icon:Icons.location_on,body:'11.017200, 76.956150'),InfoCard(title:'Plant zone 03',icon:Icons.location_on,body:'11.016650, 76.956350'),InfoCard(title:'Plant zone 04',icon:Icons.location_on,body:'11.016450, 76.955650')]);
    } else if (page == 'camera') {
      cards.add(const InfoCard(title:'ESP32-CAM',icon:Icons.videocam_off,body:'Camera preview area. Connect the camera endpoint to display live frames.'));
    }
    return ListView(padding:const EdgeInsets.all(16),children:cards.map((w)=>Padding(padding:const EdgeInsets.only(bottom:12),child:w)).toList());
  }

  String _description() {
    const descriptions = {'profile':'AGRIBOT operator profile, project information and mobile app settings.','logs':'Operational events and recent robot telemetry from the website dashboard.','device':'ESP32 controller, motor, pump and connection information.','alerts':'Robot and field conditions that need attention.','analytics':'Sensor statistics and live monitoring data.','insights':'Readable interpretation of current farm telemetry.','assistant':'AGRIBOT assistant for robot status, irrigation and sensor questions.','recommendations':'Suggestions based on current sensor thresholds and robot state.','plants':'Plant zones and farm locations used by the Field page.','camera':'ESP32-CAM monitoring and preview.','welcome':'Welcome to the AGRIBOT smart farming dashboard.'};
    return descriptions[page] ?? 'AGRIBOT website page mirrored in the mobile app.';
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
        Row(children: [
          Image.network('https://raw.githubusercontent.com/gokulmaniraj2008-collab/AGRIBOT/main/src/app/icon.png', width: 54, height: 54, fit: BoxFit.contain),
          const SizedBox(width: 12),
          const Expanded(child: Text('Live Sensor Data', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold))),
        ]),
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


class Farm extends StatelessWidget {
  final Map<String, dynamic>? row;
  const Farm({super.key, required this.row});

  @override
  Widget build(BuildContext context) {
    final lat = (row?['latitude'] as num?)?.toDouble();
    final lng = (row?['longitude'] as num?)?.toDouble();
    final hasGps = lat != null && lng != null;
    final robot = hasGps ? LatLng(lat!, lng!) : const LatLng(11.01695, 76.95585);
    const plants = [
      LatLng(11.01695, 76.95585),
      LatLng(11.01720, 76.95615),
      LatLng(11.01665, 76.95635),
      LatLng(11.01645, 76.95565),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Farm & Live GPS', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Card(
          clipBehavior: Clip.antiAlias,
          child: SizedBox(
            height: 420,
            child: FlutterMap(
              options: MapOptions(initialCenter: robot, initialZoom: 17),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'ai.agribot.app',
                ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: robot,
                      width: 54,
                      height: 54,
                      child: const Icon(Icons.smart_toy, size: 42, color: Colors.green),
                    ),
                    ...plants.map((p) => Marker(
                      point: p,
                      width: 42,
                      height: 42,
                      child: const Icon(Icons.location_on, size: 36, color: Colors.orange),
                    )),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Icon(Icons.my_location, color: Colors.green),
            title: Text(hasGps ? 'Live robot GPS' : 'Demo farm location'),
            subtitle: Text(
              'Latitude: ' + (lat?.toStringAsFixed(6) ?? robot.latitude.toStringAsFixed(6)) +
              '\nLongitude: ' + (lng?.toStringAsFixed(6) ?? robot.longitude.toStringAsFixed(6)),
            ),
          ),
        ),
        if (!hasGps)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Waiting for GPS coordinates from the ESP32. Demo plant markers are shown until live GPS is available.'),
          ),
      ],
    );
  }
}
