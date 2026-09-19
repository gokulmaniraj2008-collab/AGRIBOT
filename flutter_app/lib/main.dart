import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:fl_chart/fl_chart.dart';

const sbUrl='https://hvnasippwadzygnaodpp.supabase.co';
const sbKey=String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
const aiUrl=String.fromEnvironment('AGRIBOT_AI_URL',defaultValue:'https://agribot.website/api/ai');

Future<void> main() async {
 WidgetsFlutterBinding.ensureInitialized();
 if(sbKey.isEmpty){runApp(const MaterialApp(home:ConfigPage()));return;}
 await Supabase.initialize(url:sbUrl,publishableKey:sbKey);
 runApp(const App());
}

class ConfigPage extends StatelessWidget{const ConfigPage({super.key});@override Widget build(BuildContext c)=>const Scaffold(body:Center(child:Text('AGRIBOT\nMissing SUPABASE_PUBLISHABLE_KEY',textAlign:TextAlign.center,style:TextStyle(fontSize:22,fontWeight:FontWeight.bold))));}

class App extends StatelessWidget {
  const App({super.key});
  @override Widget build(BuildContext c) {
    return MaterialApp(
      debugShowCheckedModeBanner:false,title:'AGRIBOT',
      theme:ThemeData(useMaterial3:true,colorSchemeSeed:const Color(0xFF16A34A),
        scaffoldBackgroundColor:const Color(0xFFF8FAF9),
        cardTheme:const CardThemeData(elevation:0,color:Colors.white,margin:EdgeInsets.zero,
          shape:RoundedRectangleBorder(borderRadius:BorderRadius.all(Radius.circular(16)))),
        appBarTheme:const AppBarTheme(elevation:0,backgroundColor:Colors.white,foregroundColor:Color(0xFF111827))),
      home:Supabase.instance.client.auth.currentSession==null?const Login():const Shell());
  }
}

class Login extends StatefulWidget{
 const Login({super.key});
 @override State<Login> createState()=>_LoginState();
}
class _LoginState extends State<Login>{
 final e=TextEditingController(),p=TextEditingController(); bool signup=false,busy=false;
 Future<void> go() async {
  setState(()=>busy=true);
  try {
   final auth=Supabase.instance.client.auth;
   if(signup){
    await auth.signUp(email:e.text.trim(),password:p.text);
    if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Account created.')));
   } else {
    await auth.signInWithPassword(email:e.text.trim(),password:p.text);
    if(mounted)Navigator.pushReplacement(context,MaterialPageRoute(builder:(_)=>const Shell()));
   }
  } catch(x){
   if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(x.toString())));
  } finally {
   if(mounted)setState(()=>busy=false);
  }
 }
 @override Widget build(BuildContext c){
  return Scaffold(
   body:Center(
    child:SingleChildScrollView(
     padding:const EdgeInsets.all(24),
     child:ConstrainedBox(
      constraints:const BoxConstraints(maxWidth:430),
      child:Card(
       child:Padding(
        padding:const EdgeInsets.all(24),
        child:Column(children:[
         const Icon(Icons.agriculture,size:70,color:Color(0xFF16A34A)),
         const Text('AGRIBOT',style:TextStyle(fontSize:30,fontWeight:FontWeight.bold)),
         const SizedBox(height:20),
         TextField(controller:e,decoration:const InputDecoration(labelText:'Email',border:OutlineInputBorder())),
         const SizedBox(height:12),
         TextField(controller:p,obscureText:true,decoration:const InputDecoration(labelText:'Password',border:OutlineInputBorder())),
         const SizedBox(height:16),
         SizedBox(width:double.infinity,child:FilledButton(onPressed:busy?null:go,child:Text(busy?'Please wait':signup?'Create account':'Sign in'))),
         const SizedBox(height:4),
         SizedBox(width:double.infinity,child:OutlinedButton.icon(onPressed:busy?null:()=>Navigator.pushReplacement(context,MaterialPageRoute(builder:(_)=>const Shell(demo:true))),icon:const Icon(Icons.play_arrow),label:const Text('Continue with demo'))),
         TextButton(onPressed:()=>setState(()=>signup=!signup),child:Text(signup?'Sign in':'Create account')),
        ]),
       ),
      ),
     ),
    ),
   ),
  );
 }
}
List<Map<String,dynamic>> demoRows(){
  final now=DateTime.now();
  return List.generate(12,(i){
    final soil=58.0+i*0.7;
    return {
      'id':1000+i,
      'created_at':now.subtract(Duration(minutes:i*5)).toIso8601String(),
      'soil_moisture':soil,
      'temperature':31.5+i*0.1,
      'humidity':72.0-i*0.4,
      'distance_cm':54.0+i,
      'battery_percent':86.0-i*0.8,
      'latitude':11.01695,
      'longitude':76.95585,
      'relay':false,
      'motor':'STOPPED',
      'status':i==0?'Demo mode - robot ready':'Demo sensor reading'
    };
  });
}

class Shell extends StatefulWidget{
  final bool demo;
  const Shell({super.key,this.demo=false});
  @override State<Shell> createState()=>_ShellState();
}
class _ShellState extends State<Shell> {
  String page='Dashboard'; List<Map<String,dynamic>> rows=[]; Timer? t;
  final db=Supabase.instance.client;
  final pages=const['Dashboard','History','Profile','Logs','Device','Field','Alerts','Analytics','Insights','AI Assistant','Recommendations','Plants','Camera','Devices','Welcome','Process'];
  @override void initState(){
    super.initState();
    if(widget.demo){
      rows=demoRows();
    } else {
      load();
      t=Timer.periodic(const Duration(seconds:5),(_)=>load());
    }
  }
  @override void dispose(){t?.cancel();super.dispose();}
  Future<void> load()async{
    if(widget.demo)return;
    try{final x=await db.from('agribot_sensor_data').select().order('created_at',ascending:false).limit(100);if(mounted)setState(()=>rows=List<Map<String,dynamic>>.from(x));}catch(_){}
  }
  Map<String,dynamic>? get r=>rows.isEmpty?null:rows.first;
  Widget view(){switch(page){
    case'Dashboard':return Dashboard(rows);case'History':return History(rows);case'Profile':return const Profile();
    case'Logs':return Logs(rows);case'Device':return DevicePage(r);case'Field':return Farm(r);case'Alerts':return Alerts(rows);
    case'Analytics':return Analytics(rows);case'Insights':return Insights(r);case'AI Assistant':return const Assistant();
    case'Recommendations':return Recommendations(r);case'Plants':return Plants(r);case'Camera':return const CameraPage();
    case'Devices':return Devices(r);case'Welcome':return const Welcome();case'Process':return Process(r);default:return Dashboard(rows);}}
  void pick(String x){Navigator.pop(context);setState(()=>page=x);}
  @override Widget build(BuildContext c){
    const bp=['Dashboard','Field','AI Assistant','Profile']; final si=bp.indexOf(page);
    return Scaffold(
      drawer:Drawer(child:SafeArea(child:ListView(children:[
        const Padding(padding:EdgeInsets.all(20),child:Row(children:[Icon(Icons.agriculture,color:Color(0xFF16A34A),size:34),SizedBox(width:10),Text('AGRIBOT',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold))])),
        for(final x in pages) ListTile(selected:page==x,selectedColor:const Color(0xFF16A34A),leading:Icon(iconFor(x)),title:Text(x),onTap:()=>pick(x)),
        const Divider(),
        ListTile(leading:const Icon(Icons.logout),title:Text(widget.demo?'Exit demo':'Sign out'),onTap:()async{if(widget.demo){if(mounted)Navigator.pushAndRemoveUntil(context,MaterialPageRoute(builder:(_)=>const Login()),(_)=>false);}else{await db.auth.signOut();if(mounted)Navigator.pushAndRemoveUntil(context,MaterialPageRoute(builder:(_)=>const Login()),(_)=>false);}}),
      ]))),
      appBar:AppBar(title:Text(page),actions:[if(widget.demo)const Padding(padding:EdgeInsets.symmetric(horizontal:8),child:Center(child:Text('DEMO',style:TextStyle(fontWeight:FontWeight.bold,color:Color(0xFF16A34A))))),IconButton(onPressed:widget.demo?null:load,icon:const Icon(Icons.refresh)),IconButton(onPressed:()=>pick('Alerts'),icon:const Icon(Icons.notifications_none))]),
      body:view(),
      bottomNavigationBar:NavigationBar(selectedIndex:si<0?0:si,onDestinationSelected:(i)=>setState(()=>page=bp[i]),destinations:const[
        NavigationDestination(icon:Icon(Icons.dashboard_outlined),label:'Home'),NavigationDestination(icon:Icon(Icons.map_outlined),label:'Farm'),
        NavigationDestination(icon:Icon(Icons.auto_awesome_outlined),label:'AI'),NavigationDestination(icon:Icon(Icons.person_outline),label:'Profile')]),
    );
  }
}
IconData iconFor(String x)=>switch(x){ 'Dashboard'=>Icons.dashboard,'History'=>Icons.history,'Profile'=>Icons.person,'Logs'=>Icons.list_alt,'Device'=>Icons.smart_toy,'Field'=>Icons.map,'Alerts'=>Icons.notifications,'Analytics'=>Icons.bar_chart,'Insights'=>Icons.insights,'AI Assistant'=>Icons.auto_awesome,'Recommendations'=>Icons.recommend,'Plants'=>Icons.local_florist,'Camera'=>Icons.camera_alt,'Devices'=>Icons.devices,'Welcome'=>Icons.waving_hand,'Process'=>Icons.route,_=>Icons.circle};

class Page extends StatelessWidget{final String title,sub;final Widget child;const Page({super.key,required this.title,required this.child,this.sub=''});@override Widget build(BuildContext c)=>ListView(padding:const EdgeInsets.all(16),children:[Text(title,style:const TextStyle(fontSize:26,fontWeight:FontWeight.bold)),if(sub.isNotEmpty)Padding(padding:const EdgeInsets.only(top:4),child:Text(sub,style:const TextStyle(color:Colors.grey))),const SizedBox(height:14),child]);}
dynamic val(Map<String,dynamic>?r,String k)=>r==null?null:r[k];

 class Dashboard extends StatelessWidget{final List<Map<String,dynamic>>a;const Dashboard(this.a,{super.key});@override Widget build(BuildContext c){final r=a.isEmpty?null:a.first;return Page(title:'Farm Dashboard',sub:'Live AGRIBOT overview',child:Column(children:[Wrap(spacing:10,runSpacing:10,children:[Metric('Soil',val(r,'soil_moisture'),'%'),Metric('Temperature',val(r,'temperature'),'°C'),Metric('Humidity',val(r,'humidity'),'%'),Metric('Distance',val(r,'distance_cm'),' cm'),Metric('Battery',val(r,'battery_percent'),'%'),Metric('Pump',r?['relay']==true?'ON':'OFF','')]),const SizedBox(height:12),Card(child:ListTile(leading:const CircleAvatar(backgroundColor:Color(0xFFEAF8EE),child:Icon(Icons.smart_toy,color:Color(0xFF16A34A))),title:const Text('AGRIBOT-01'),subtitle:Text((r?['status']??'Waiting for sensor data').toString()+' · Motor '+(r?['motor']??'—').toString()))),const SizedBox(height:10),Card(child:ListTile(leading:const Icon(Icons.sync,color:Color(0xFF16A34A)),title:const Text('Live data'),subtitle:Text(a.length.toString()+' recent readings · 5 second refresh')))]));}}
class Metric extends StatelessWidget{final String t,s;final dynamic v;const Metric(this.t,this.v,this.s,{super.key});@override Widget build(BuildContext c)=>SizedBox(width:MediaQuery.of(c).size.width/2-22,child:Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(t,style:const TextStyle(color:Colors.grey)),const SizedBox(height:8),Text(v==null?'—':(v is num?(v as num).toStringAsFixed(1)+s:v.toString()),style:const TextStyle(fontSize:22,fontWeight:FontWeight.bold))]))));}

class History extends StatelessWidget{final List<Map<String,dynamic>>a;const History(this.a,{super.key});@override Widget build(BuildContext c)=>Page(title:'History',sub:'Sensor readings and events',child:Column(children:[for(final r in a)Card(margin:const EdgeInsets.only(bottom:8),child:ListTile(leading:const Icon(Icons.timeline,color:Color(0xFF16A34A)),title:Text('${r['soil_moisture']??'—'}% soil · ${r['temperature']??'—'}°C'),subtitle:Text('${r['status']??'—'}\n${r['created_at']??''}')))]));}
class Logs extends StatelessWidget{final List<Map<String,dynamic>>a;const Logs(this.a,{super.key});@override Widget build(BuildContext c)=>Page(title:'Logs',sub:'Robot activity',child:Column(children:[for(final r in a)Card(margin:const EdgeInsets.only(bottom:8),child:ListTile(leading:const Icon(Icons.article_outlined),title:Text('${r['status']??'Event'}'),subtitle:Text('Soil ${r['soil_pct']??r['soil_moisture']??'—'} · ${r['created_at']??''}')))]));}
class Profile extends StatelessWidget{const Profile({super.key});@override Widget build(BuildContext c){final u=Supabase.instance.client.auth.currentUser;return Page(title:'Profile',sub:'Account and settings',child:Column(children:[Card(child:ListTile(leading:const CircleAvatar(child:Icon(Icons.person)),title:Text(u?.email??'AGRIBOT User'),subtitle:const Text('Authenticated Supabase session'))),const SizedBox(height:10),const Card(child:Column(children:[ListTile(leading:Icon(Icons.palette),title:Text('AGRIBOT website theme'),subtitle:Text('Green, white, rounded cards and field-ready surfaces')),ListTile(leading:Icon(Icons.sync),title:Text('Live updates'),subtitle:Text('Sensor data refreshes automatically'))]))]));}}
class DevicePage extends StatelessWidget{final Map<String,dynamic>?r;const DevicePage(this.r,{super.key});@override Widget build(BuildContext c)=>Page(title:'ESP32 Device',sub:'Detailed device monitoring',child:Column(children:[DeviceStatus(r),const SizedBox(height:10),Card(child:Column(children:[Info('Motor',r?['motor']),Info('Pump',r?['relay']==true?'ON':'OFF'),Info('Soil',r?['soil_moisture']!=null?(r!['soil_moisture'].toString()+'%'):null),Info('Temperature',r?['temperature']!=null?(r!['temperature'].toString()+'°C'):null),Info('Humidity',r?['humidity']!=null?(r!['humidity'].toString()+'%'):null),Info('Distance',r?['distance_cm']!=null?(r!['distance_cm'].toString()+' cm'):null),Info('GPS',r?['latitude']!=null?(r!['latitude'].toString()+', '+r!['longitude'].toString()):null)]))]));}
class Devices extends StatelessWidget{final Map<String,dynamic>?r;const Devices(this.r,{super.key});@override Widget build(BuildContext c)=>Page(title:'Devices',sub:'Connected hardware',child:Column(children:[DeviceStatus(r),const SizedBox(height:10),Tile('ESP32 controller',Icons.memory,r!=null),Tile('GPS',Icons.location_on,r?['latitude']!=null),Tile('Sensors',Icons.sensors,r!=null),Tile('Camera',Icons.camera_alt,false)]));}
class DeviceStatus extends StatelessWidget{final Map<String,dynamic>?r;const DeviceStatus(this.r,{super.key});@override Widget build(BuildContext c){final d=r?['created_at']==null?null:DateTime.tryParse(r!['created_at'].toString());final on=d!=null&&DateTime.now().difference(d.toLocal()).inSeconds<30;return Card(child:ListTile(leading:CircleAvatar(child:Icon(on?Icons.wifi:Icons.wifi_off,color:on?const Color(0xFF16A34A):Colors.grey)),title:const Text('AGRIBOT-01'),subtitle:Text(on?'Online':'Waiting for latest heartbeat')));}}
class Info extends StatelessWidget{final String t;final dynamic v;const Info(this.t,this.v,{super.key});@override Widget build(BuildContext c)=>ListTile(title:Text(t),trailing:Text(v?.toString()??'—',style:const TextStyle(fontWeight:FontWeight.w600)));}class Tile extends StatelessWidget{final String t;final IconData i;final bool on;const Tile(this.t,this.i,this.on,{super.key});@override Widget build(BuildContext c)=>Card(margin:const EdgeInsets.only(bottom:8),child:ListTile(leading:Icon(i,color:on?const Color(0xFF16A34A):Colors.grey),title:Text(t),trailing:Chip(label:Text(on?'Connected':'Unavailable'))));}

class Farm extends StatelessWidget{final Map<String,dynamic>?r;const Farm(this.r,{super.key});@override Widget build(BuildContext c){final la=(r?['latitude']as num?)?.toDouble(),lo=(r?['longitude']as num?)?.toDouble();final p=la!=null&&lo!=null?LatLng(la,lo):const LatLng(11.01695,76.95585);return Page(title:'Field',sub:'Live farm map and GPS',child:Column(children:[SizedBox(height:420,child:ClipRRect(borderRadius:BorderRadius.circular(16),child:FlutterMap(options:MapOptions(initialCenter:p,initialZoom:17),children:[TileLayer(urlTemplate:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',userAgentPackageName:'ai.agribot.app'),MarkerLayer(markers:[Marker(point:p,width:55,height:55,child:const Icon(Icons.smart_toy,color:Color(0xFF16A34A),size:42))])]))),const SizedBox(height:10),Card(child:ListTile(leading:const Icon(Icons.my_location,color:Color(0xFF16A34A)),title:Text(la==null?'Waiting for GPS':'Live robot location'),subtitle:Text('Latitude: '+(la?.toStringAsFixed(6)??'—')+'\nLongitude: '+(lo?.toStringAsFixed(6)??'—'))))]));}}
class Alerts extends StatelessWidget{final List<Map<String,dynamic>>a;const Alerts(this.a,{super.key});@override Widget build(BuildContext c){final x=a.where((r){final s=(r['status']??'').toString().toLowerCase();return s.contains('obstacle')||s.contains('error')||s.contains('dry');}).toList();return Page(title:'Alerts',sub:'Live conditions needing attention',child:Column(children:[if(x.isEmpty)const Card(child:ListTile(leading:Icon(Icons.check_circle,color:Color(0xFF16A34A)),title:Text('No active alerts'),subtitle:Text('No matching alert conditions in recent readings.'))),for(final r in x)Card(margin:const EdgeInsets.only(bottom:8),child:ListTile(leading:const Icon(Icons.warning_amber,color:Colors.orange),title:Text('${r['status']??'Alert'}'),subtitle:Text('${r['created_at']??''}')))]));}}
class Analytics extends StatelessWidget{final List<Map<String,dynamic>>a;const Analytics(this.a,{super.key});@override Widget build(BuildContext c){final x=a.take(20).toList().reversed.toList();return Page(title:'Analytics',sub:'Sensor trends',child:Card(child:Padding(padding:const EdgeInsets.all(12),child:SizedBox(height:300,child:LineChart(LineChartData(titlesData:const FlTitlesData(show:true),lineBarsData:[LineChartBarData(isCurved:true,spots:[for(var i=0;i<x.length;i++)FlSpot(i.toDouble(),(x[i]['soil_moisture']as num?)?.toDouble()??0)])]))))));}}
class Insights extends StatelessWidget{final Map<String,dynamic>?r;const Insights(this.r,{super.key});@override Widget build(BuildContext c)=>Page(title:'Insights',sub:'Current farm signals',child:Column(children:[Card(child:ListTile(leading:const Icon(Icons.insights,color:Color(0xFF16A34A)),title:const Text('Soil'),subtitle:Text('Current moisture: '+(r?['soil_moisture']??'—').toString()+'%')),),Card(child:ListTile(leading:const Icon(Icons.thermostat),title:const Text('Environment'),subtitle:Text('Temperature '+(r?['temperature']??'—').toString()+'°C · Humidity '+(r?['humidity']??'—').toString()+'%')),),Card(child:ListTile(leading:const Icon(Icons.route),title:const Text('Robot state'),subtitle:Text((r?['status']??'No status').toString())))]));}
class Recommendations extends StatelessWidget{final Map<String,dynamic>?r;const Recommendations(this.r,{super.key});@override Widget build(BuildContext c){final s=(r?['soil_moisture']as num?)?.toDouble();final dry=s!=null&&s<30;return Page(title:'Recommendations',sub:'Rule-based recommendations from live readings',child:Column(children:[Card(child:ListTile(leading:Icon(dry?Icons.water:Icons.check_circle,color:dry?Colors.orange:const Color(0xFF16A34A)),title:Text(dry?'Inspect irrigation':'No dry-soil trigger'),subtitle:Text('Soil moisture: '+(s?.toStringAsFixed(1)??'—')+'%'))),const Card(child:ListTile(leading:Icon(Icons.sensors),title:Text('Keep sensors active'),subtitle:Text('Fresh readings improve robot decisions.')))]));}}
class Plants extends StatelessWidget{final Map<String,dynamic>?r;const Plants(this.r,{super.key});@override Widget build(BuildContext c){const names=['Plant Zone A','Plant Zone B','Plant Zone C','Plant Zone D'];return Page(title:'Plants',sub:'Farm zones',child:Column(children:[for(final x in names)Card(margin:const EdgeInsets.only(bottom:8),child:ListTile(leading:const Icon(Icons.local_florist,color:Color(0xFF16A34A)),title:Text(x),subtitle:Text('Live soil: ${r?['soil_moisture']??'—'}%')))]));}}
class CameraPage extends StatefulWidget{const CameraPage({super.key});@override State<CameraPage> createState()=>_CameraState();}
class _CameraState extends State<CameraPage>{Uint8List?data;Future<void>pick(ImageSource s)async{final x=await ImagePicker().pickImage(source:s,imageQuality:80);if(x==null)return;final b=await x.readAsBytes();setState(()=>data=b);}@override Widget build(BuildContext c)=>Page(title:'Camera',sub:'Capture or select a farm image',child:Column(children:[Card(child:SizedBox(height:300,width:double.infinity,child:data==null?const Icon(Icons.camera_alt,size:70,color:Colors.grey):Image.memory(data!,fit:BoxFit.cover))),const SizedBox(height:12),Row(children:[Expanded(child:FilledButton.icon(onPressed:()=>pick(ImageSource.camera),icon:const Icon(Icons.camera_alt),label:const Text('Camera'))),const SizedBox(width:10),Expanded(child:OutlinedButton.icon(onPressed:()=>pick(ImageSource.gallery),icon:const Icon(Icons.photo),label:const Text('Gallery')))])]));}

class Assistant extends StatefulWidget{const Assistant({super.key});@override State<Assistant> createState()=>_AssistantState();}
class _AssistantState extends State<Assistant>{final q=TextEditingController();String?ans,err;bool busy=false;Future<void>ask()async{if(q.text.trim().isEmpty)return;setState(()=>busy=true);try{final z=await http.post(Uri.parse(aiUrl),headers:{'Content-Type':'application/json'},body:jsonEncode({'text':q.text.trim()}));final d=jsonDecode(z.body);if(z.statusCode>=400)throw Exception(d['error']??'AI request failed');setState(()=>ans=d['answer']?.toString()??'No answer');}catch(e){setState(()=>err=e.toString());}finally{if(mounted)setState(()=>busy=false);}}@override Widget build(BuildContext c)=>Page(title:'AI Assistant',sub:'AGRIBOT AI',child:Column(children:[Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(children:[const Icon(Icons.auto_awesome,size:48,color:Color(0xFF16A34A)),TextField(controller:q,maxLines:4,decoration:const InputDecoration(hintText:'Ask about soil, robot, watering or farm conditions',border:OutlineInputBorder())),const SizedBox(height:10),SizedBox(width:double.infinity,child:FilledButton.icon(onPressed:busy?null:ask,icon:const Icon(Icons.send),label:Text(busy?'Thinking…':'Ask AI')))]))),if(err!=null)Card(child:ListTile(leading:const Icon(Icons.error,color:Colors.red),title:Text(err!))),if(ans!=null)Card(child:Padding(padding:const EdgeInsets.all(16),child:Text(ans!)))]));}

class Welcome extends StatelessWidget{const Welcome({super.key});@override Widget build(BuildContext c)=>Page(title:'Welcome to AGRIBOT',sub:'Smart agriculture monitoring and robotics',child:Column(children:[Card(child:Padding(padding:const EdgeInsets.all(24),child:Column(children:const[Icon(Icons.agriculture,size:76,color:Color(0xFF16A34A)),Text('Monitor. Understand. Act.',style:TextStyle(fontSize:24,fontWeight:FontWeight.bold)),SizedBox(height:8),Text('Your mobile AGRIBOT companion for live field data, robot status and AI assistance.',textAlign:TextAlign.center)]))),const SizedBox(height:10),const Card(child:ListTile(leading:Icon(Icons.speed),title:Text('Live monitoring'),subtitle:Text('Sensors and robot status refresh automatically.'))),const Card(child:ListTile(leading:Icon(Icons.map),title:Text('Farm map'),subtitle:Text('Track the robot with GPS.'))),const Card(child:ListTile(leading:Icon(Icons.auto_awesome),title:Text('AI assistant'),subtitle:Text('Ask the connected AGRIBOT AI service.')))]));}
class Process extends StatelessWidget{final Map<String,dynamic>?r;const Process(this.r,{super.key});@override Widget build(BuildContext c){const a=['POWER ON','ESP32 STARTS','STOP FOR 3 SEC','REVERSE / MOVE','ULTRASONIC SENSOR','OBSTACLE < 15 CM?','MOTOR STOP','SERVO → 90°','WAIT 5 SECONDS','READ SOIL MOISTURE','SOIL < 30%?','PUMP ON / WATER 5 SEC','READ SOIL AGAIN','PUMP OFF','SERVO → 0°','FORWARD 3 SEC','MOTOR STOP / DONE'];final s=(r?['status']??'').toString().toUpperCase();var n=1;if(s.contains('REVERSE'))n=3;if(s.contains('OBSTACLE'))n=6;if(s.contains('WATER')||r?['relay']==true)n=11;if(s.contains('SOIL OK')||s.contains('PUMP OFF'))n=13;if(s.contains('FORWARD'))n=15;if(s.contains('DONE')||s.contains('FINAL'))n=16;return Page(title:'Process',sub:'Live robot sequence',child:Column(children:[for(var i=0;i<a.length;i++)Card(margin:const EdgeInsets.only(bottom:6),child:ListTile(leading:CircleAvatar(backgroundColor:i<=n?const Color(0xFFEAF8EE):const Color(0xFFF3F4F6),child:Text((i+1).toString())),title:Text(a[i]),trailing:i<n?const Icon(Icons.check,color:Color(0xFF16A34A)):null))]));}}
