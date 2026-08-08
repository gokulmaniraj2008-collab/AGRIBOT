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
  ph_level: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  water_tank_percent: number | null;
};

export type RobotStatus = {
  robot_id: string;
  updated_at: string;
  online: boolean;
  mode: "manual" | "auto";
  pump_status: boolean;
  motor_state: "stopped" | "forward" | "backward" | "left" | "right";
  speed_value: number;
  heater_status: boolean;
  cooler_status: boolean;
  vent_fan_status: boolean;
  irrigation_auto: boolean;
  irrigation_threshold: number;
  ventilation_auto: boolean;
  target_temp_min: number;
  target_temp_max: number;
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
  | "heater_on"
  | "heater_off"
  | "cooler_on"
  | "cooler_off"
  | "vent_on"
  | "vent_off"
  | "set_irrigation_auto_on"
  | "set_irrigation_auto_off"
  | "set_irrigation_threshold"
  | "set_ventilation_auto_on"
  | "set_ventilation_auto_off"
  | "set_target_temp_min"
  | "set_target_temp_max";

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
