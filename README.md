# PowerAlert for Homey

Monitor South Africa's power status and loadshedding information directly on your Homey smart home system. This app integrates with the PowerAlert.co.za service to provide real-time power status information and forecasts.

## Features

- **Live Loadshedding Status**: Monitor the current loadshedding stage (0-8)
- **Power Probability**: Get the probability percentage for stable power
- **System Status**: View detailed status messages about the power grid
- **Power Forecasts**: Access forecasts showing:
  - Peak Demand (MW)
  - Available Capacity (MW)
  - Lowest Margin (MW) 
  - Highest Expected Stage
- **Insights Integration**: Track power data over time with Homey Insights

## Usage

After installation, add a new "Power Status" device through the Homey devices page. The app will automatically fetch data from PowerAlert.co.za every 10 minutes.

### Flows

Create automations based on power conditions using:

#### Triggers
- **Loadshedding stage changed**: Triggers when the stage changes
- **Power probability changed significantly**: Triggers when probability shifts by at least 10%

#### Conditions
- **Loadshedding stage is/is not [X]**: Check if current stage matches a specific value
- **Power probability is/is not below [X]%**: Check if probability is below a threshold

#### Actions
- **Update PowerAlert data**: Force an immediate update

### Insights

Track power data over time with Homey Insights. The following metrics are automatically logged:

- Loadshedding Stage: Monitor stage changes over time
- Power Probability: Track how the probability of power stability changes
- Peak Demand: See how peak electricity demand fluctuates
- Available Capacity: Track the available power generation capacity
- Lowest Margin: Monitor the margin between demand and capacity
- Forecast Highest Stage: See how the forecast for loadshedding changes

Access these insights in the Homey mobile app or web interface under the Insights section.

## Technical Details

This app uses the PowerAlert API, which provides:
- Current system status (color-coded indicators, direction trends)
- Detailed forecast information

The app converts color codes to familiar loadshedding stages and probability values, and ensures all time values are displayed in South African Standard Time (SAST).

## Support

For support, please contact the developer or file an issue on the GitHub repository.

## Credits

- Data provided by [PowerAlert.co.za](https://www.poweralert.co.za/)
- App developed by Neil Donnelly