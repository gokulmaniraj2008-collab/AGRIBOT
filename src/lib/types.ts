export type SensorReading = {
  id: number;
  created_at: string;
  soil_moisture: number | null;
  temperature: number | null;
  humidity: number | null;
  distance_cm: number | null;
  battery_voltage: number | null;
  battery_percent: number | null;
  latitude: number | null;
  longitude: number | null;
  plant_index: number | null;
};

export type RobotStatus = {
  robot_id: string;
  name: string;
  updated_at: string;
  online: boolean;
  mode: "manual" | "auto";
  pump_status: boolean;
  motor_state: "stopped" | "forward" | "backward" | "left" | "right";
  speed_value: number;
  irrigation_auto: boolean;
  irrigation_threshold: number;
  gps_fix: boolean;
  gps_satellites: number | null;
  last_latitude: number | null;
  last_longitude: number | null;
  camera_ip?: string | null; // set by agribot-01-cam's heartbeat only — the
                              // main agribot-01 row won't have this populated
};

export type RobotCommand =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "stop"
  | "pump_on"
  | "pump_off"
  | "set_speed"
  | "set_mode_auto"
  | "set_mode_manual"
  | "set_irrigation_auto_on"
  | "set_irrigation_auto_off"
  | "set_irrigation_threshold"
  | "patrol_row"
  | "save_plant_location"
  | "goto_plant"
  | "goto_and_water_all";

export type PlantLocation = {
  id: number;
  created_at: string;
  robot_id: string;
  plant_index: number;
  latitude: number;
  longitude: number;
};

export type Profile = {
  id: string;
  email: string | null;
  role: "user" | "admin";
  created_at: string;
};

export type HomeVideo = {
  id: number;
  url: string;
  title: string | null;
  sort_order: number;
  created_at: string;
};

export type RobotCommandRow = {
  id: number;
  created_at: string;
  robot_id: string;
  command: RobotCommand;
  value: number | null;
  executed: boolean;
  executed_at: string | null;
};

export type DeviceMessage = {
  id: number;
  created_at: string;
  robot_id: string;
  origin: "esp32" | "website";
  level: "info" | "warning" | "error" | "success";
  message: string;
  read: boolean;
};

export type RobotLog = {
  id: number;
  created_at: string;
  robot_id: string;
  plant_id: number | null;
  event_type: string;
  message: string;
  value: number | null;
};

export type PlantAnalysis = {
  id: number;
  created_at: string;
  user_id: string;
  image_path: string;
  plant: string | null;
  condition: string | null;
  confidence: number | null;
  severity: "Low" | "Moderate" | "High" | "None" | null;
  recommended_action: string | null;
  raw_response: string | null;
};
