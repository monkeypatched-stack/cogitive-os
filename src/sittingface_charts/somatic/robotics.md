# robotics

## Capability: robotics
- **ID:** cap-robot-001
- **Platform:** Robotics/IoT
- **Version:** 1.0.0
- **Status:** active
- **Description:** Robotics and IoT protocol integrations (ROS, MQTT, OPC-UA)
- **Module:** Cerebellum
- **Tags:** robotics, iot, mqtt, opcua

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/robotics`
- **Protocol:** http

### Operations
- **publish_sensor** (CREATE): Publish sensor data
- **subscribe_sensor** (READ): Subscribe to sensor data

### Test Scenarios
- happy_path
- timeout
- error
