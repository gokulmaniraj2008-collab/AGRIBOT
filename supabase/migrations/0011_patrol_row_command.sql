-- Add 'patrol_row' to the allowed robot_commands.command values.
-- The firmware (agribot_main.ino) already handles this command;
-- the API route and RobotCommand type were updated to allow it,
-- but the DB check constraint was never widened to match, so
-- inserts for 'patrol_row' were failing with a check-constraint
-- violation.

alter table public.robot_commands
  drop constraint if exists robot_commands_command_check;

alter table public.robot_commands
  add constraint robot_commands_command_check
  check (command in (
    'forward','backward','left','right','stop',
    'pump_on','pump_off','set_speed',
    'set_mode_auto','set_mode_manual',
    'heater_on','heater_off',
    'cooler_on','cooler_off',
    'vent_on','vent_off',
    'set_irrigation_auto_on','set_irrigation_auto_off',
    'set_irrigation_threshold',
    'set_ventilation_auto_on','set_ventilation_auto_off',
    'set_target_temp_min','set_target_temp_max',
    'patrol_row'
  ));
