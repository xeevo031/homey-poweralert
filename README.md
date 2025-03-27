# PowerAlert for Homey

Monitor South Africa's power grid status in real-time with PowerAlert integration for Homey. This app provides detailed information about the current state of the Eskom power grid, including power margins, demand levels, and system stability.

## Features

- Real-time Eskom grid monitoring
- Automated alerts and notifications
- Comprehensive power metrics tracking
- Trend analysis and predictions
- Configurable thresholds and alerts
- Mobile notifications support
- Historical data analysis
- Energy risk scoring
- Optimal energy period recommendations

## Flow Card Tags and Data Derivation

Each flow card in the app uses specific tags to define its behavior and data requirements. These tags are used to:
1. Define the data structure
2. Specify validation rules
3. Determine data sources
4. Control flow behavior

### Common Tag Types

1. **Data Source Tags**
   - `source`: Specifies where the data comes from (API, calculated, derived)
   - `update_interval`: How often the data is updated
   - `timezone`: Timezone for the data (default: SAST)

2. **Validation Tags**
   - `required`: Whether the tag is mandatory
   - `type`: Data type (number, string, boolean, etc.)
   - `range`: Valid value range for numeric data
   - `enum`: Valid values for enumerated data

3. **Behavior Tags**
   - `trigger_on`: When the flow should trigger
   - `condition_type`: Type of condition check
   - `action_type`: Type of action to perform

### Detailed Flow Analysis

#### Status Change Triggers

1. **system_color_changed**
   ```json
   {
     "source": "API",
     "data": {
       "previous_color": "string (enum: Red|Orange|Green)",
       "current_color": "string (enum: Red|Orange|Green)",
       "timestamp": "datetime",
       "color_id": "number (enum: 1,2,3,4)"
     },
     "trigger_on": "value_change",
     "validation": {
       "required": ["previous_color", "current_color", "timestamp"],
       "type": "object"
     }
   }
   ```
   - Data Source: Direct from PowerAlert API
   - Update Frequency: Every API poll (5 minutes default)
   - Validation: Ensures valid color transitions

2. **status_changed**
   ```json
   {
     "source": "API",
     "data": {
       "previous_status": "object",
       "current_status": "object",
       "changed_fields": "array",
       "timestamp": "datetime"
     },
     "trigger_on": "any_change",
     "validation": {
       "required": ["previous_status", "current_status", "timestamp"],
       "type": "object"
     }
   }
   ```
   - Data Source: PowerAlert API
   - Update Frequency: Every API poll
   - Validation: Tracks all status changes

3. **trend_changed**
   ```json
   {
     "source": "calculated",
     "data": {
       "previous_trend": "string (enum: Up|Down|Stable)",
       "current_trend": "string (enum: Up|Down|Stable)",
       "confidence": "number (0-100)",
       "timestamp": "datetime"
     },
     "trigger_on": "trend_change",
     "validation": {
       "required": ["previous_trend", "current_trend", "timestamp"],
       "type": "object"
     }
   }
   ```
   - Data Source: Calculated from historical data
   - Update Frequency: Every calculation cycle
   - Validation: Ensures valid trend transitions

#### Threshold Triggers

1. **margin_threshold_reached**
   ```json
   {
     "source": "calculated",
     "data": {
       "threshold_type": "string (enum: critical|warning|stable)",
       "current_margin": "number (MW)",
       "threshold_value": "number (MW)",
       "timestamp": "datetime"
     },
     "trigger_on": "threshold_cross",
     "validation": {
       "required": ["threshold_type", "current_margin", "threshold_value"],
       "type": "object"
     }
   }
   ```
   - Data Source: Calculated from capacity and demand
   - Update Frequency: Every calculation cycle
   - Validation: Ensures valid threshold values

2. **demand_threshold_reached**
   ```json
   {
     "source": "API",
     "data": {
       "threshold_type": "string (enum: peak|high|normal)",
       "current_demand": "number (MW)",
       "threshold_value": "number (MW)",
       "timestamp": "datetime"
     },
     "trigger_on": "threshold_cross",
     "validation": {
       "required": ["threshold_type", "current_demand", "threshold_value"],
       "type": "object"
     }
   }
   ```
   - Data Source: PowerAlert API
   - Update Frequency: Every API poll
   - Validation: Ensures valid demand values

#### Time-based Triggers

1. **peak_demand_time**
   ```json
   {
     "source": "calculated",
     "data": {
       "time_period": "string (enum: morning|evening)",
       "start_time": "time",
       "end_time": "time",
       "confidence": "number (0-100)",
       "timestamp": "datetime"
     },
     "trigger_on": "time_period",
     "validation": {
       "required": ["time_period", "start_time", "end_time"],
       "type": "object"
     }
   }
   ```
   - Data Source: Calculated from historical patterns
   - Update Frequency: Daily
   - Validation: Ensures valid time periods

2. **status_duration_exceeded**
   ```json
   {
     "source": "calculated",
     "data": {
       "status": "string",
       "duration": "number (minutes)",
       "threshold": "number (minutes)",
       "timestamp": "datetime"
     },
     "trigger_on": "duration_exceeded",
     "validation": {
       "required": ["status", "duration", "threshold"],
       "type": "object"
     }
   }
   ```
   - Data Source: Calculated from status history
   - Update Frequency: Every minute
   - Validation: Ensures valid duration values

#### System State Conditions

1. **system_critical**
   ```json
   {
     "source": "derived",
     "data": {
       "margin": "number (MW)",
       "utilization": "number (0-100)",
       "thresholds": {
         "critical_margin": "number (MW)",
         "high_utilization": "number (0-100)"
       },
       "timestamp": "datetime"
     },
     "condition_type": "threshold_check",
     "validation": {
       "required": ["margin", "utilization", "thresholds"],
       "type": "object"
     }
   }
   ```
   - Data Source: Derived from multiple metrics
   - Update Frequency: Every calculation cycle
   - Validation: Ensures valid threshold values

2. **system_improving**
   ```json
   {
     "source": "calculated",
     "data": {
       "trend": "string (enum: improving|stable|worsening)",
       "confidence": "number (0-100)",
       "historical_data": "array",
       "timestamp": "datetime"
     },
     "condition_type": "trend_analysis",
     "validation": {
       "required": ["trend", "confidence"],
       "type": "object"
     }
   }
   ```
   - Data Source: Calculated from trend analysis
   - Update Frequency: Every calculation cycle
   - Validation: Ensures valid trend data

#### Analysis Actions

1. **calculate_energy_risk_score**
   ```json
   {
     "source": "calculated",
     "data": {
       "margin": "number (MW)",
       "utilization": "number (0-100)",
       "trend": "string",
       "historical_data": "array",
       "timestamp": "datetime"
     },
     "action_type": "risk_calculation",
     "validation": {
       "required": ["margin", "utilization", "trend"],
       "type": "object"
     }
   }
   ```
   - Data Source: Calculated from multiple metrics
   - Update Frequency: Every calculation cycle
   - Validation: Ensures valid input data

2. **get_optimal_energy_period**
   ```json
   {
     "source": "calculated",
     "data": {
       "forecast": "array",
       "confidence": "number (0-100)",
       "time_period": "string",
       "timestamp": "datetime"
     },
     "action_type": "period_analysis",
     "validation": {
       "required": ["forecast", "confidence"],
       "type": "object"
     }
   }
   ```
   - Data Source: Calculated from forecast data
   - Update Frequency: Daily
   - Validation: Ensures valid forecast data

### Data Derivation Methods

1. **API Data**
   - Direct from PowerAlert API
   - Updated every 5 minutes (configurable)
   - Includes raw metrics and status indicators

2. **Calculated Data**
   - Derived from API data using mathematical formulas
   - Updated with each API poll
   - Includes statistical calculations and trend analysis

3. **Derived Data**
   - Combined from multiple data sources
   - Updated when source data changes
   - Includes system status and risk assessments

4. **Historical Data**
   - Stored for 24-hour period
   - Used for trend analysis and predictions
   - Updated continuously

## System Capabilities

### API-Provided Data (Direct from PowerAlert)
Raw data fetched directly from PowerAlert API:

```json
{
    "Timestamp": "2025-03-27T04:00:00",    // Current timestamp
    "Date": "2025-03-27T00:00:00",         // Base date
    "Hour": 4,                             // Hour of day
    "ColorId": 2,                          // System status ID (1,4=Red, 2=Green, 3=Orange)
    "DirectionId": 1,                      // Trend direction ID (1=Up, 2=Down, 3=Stable)
    "Color": "Green",                      // System status color
    "Direction": "Up",                     // Trend direction
    "DeclaredAvailabilty": 24483.800,      // Available power capacity in MW
    "LoadForecast": 21916.000,             // Current power demand in MW
    "MaxAvailability": 27746.800           // Maximum available capacity in MW
}
```

#### Primary Metrics
- `LoadForecast`: Current power demand in MW
- `DeclaredAvailabilty`: Current available power capacity in MW
- `MaxAvailability`: Maximum available capacity in MW

#### Status Indicators
- `Color`: System status (Red/Orange/Green)
- `Direction`: Demand trend (Up/Down/Stable)
- `ColorId`: Numeric status code
  - 1 or 4: Red (Critical)
  - 2: Green (Stable)
  - 3: Orange (Warning)
- `DirectionId`: Numeric trend code
  - 1: Up (Increasing)
  - 2: Down (Decreasing)
  - 3: Stable

### Derived Capabilities (Calculated by App)
Values calculated from the API data:

#### Statistical Calculations
- `average_capacity`: Calculated from historical capacity values
- `average_demand`: Calculated from historical demand values
- `average_margin`: Calculated as (average_capacity - average_demand)
- `average_max_availability`: Rolling average of maximum availability
- `lowest_margin`: Minimum recorded margin value
- `power_probability`: Calculated risk based on margins and trends

#### System Status
- `system_color`: Derived from margin thresholds
  - Red: Below critical margin
  - Orange: Below warning margin
  - Green: Above stable margin
- `system_direction`: Calculated from trend analysis
- `trend_status`: Derived from historical data patterns
- `status_message`: Generated from multiple metrics

#### Real-time Calculations
- Power margin: (capacity - demand)
- System utilization: (demand/capacity) × 100
- Reserve margin: (margin/capacity) × 100

## Data Updates

All data is updated every 5 minutes by default (configurable from 1-60 minutes). Each update includes:

1. **API Data Fetch**
   - Retrieves current power status
   - Gets detailed forecast data
   - Updates all primary metrics

2. **Calculations**
   - Statistical averages
   - Trend analysis
   - System status evaluation
   - Threshold checks

3. **Event Processing**
   - Triggers for value changes
   - Threshold crossing notifications
   - Status change alerts

## Configuration

### General Settings
- Update interval: 1-60 minutes (default: 5)

### Threshold Settings
- Critical margin threshold (MW)
- Stable margin threshold (MW)
- High utilization threshold (%)
- Margin thresholds (MW)
- Demand thresholds (MW)
- Capacity thresholds (MW)

### Status Message Format

The app provides concise status messages in the following format:
```
The Eskom grid is [status]. Margin: [X] MW ([margin status]). [Y]% utilization. Demand [trend].
```

Example:
```
The Eskom grid is under pressure. Margin: 473 MW (Critical situation). 98.1% utilization. Demand decreasing.
```

## Technical Details

### Data Management
- PowerAlert API polling every 5 minutes (configurable)
- 24-hour historical data tracking
- Automatic capability updates
- Error handling and retry mechanism
- SAST (South African Standard Time) timezone support

### System Requirements
- Homey Pro
- Internet connection
- PowerAlert API access (no key required)

## Support

For support, please visit the Homey Community Forum or raise an issue on GitHub.

## Credits

This app uses data from PowerAlert (https://www.poweralert.co.za/)