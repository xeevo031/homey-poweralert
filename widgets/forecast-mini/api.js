'use strict';

module.exports = {
  async getSomething({ homey, query }) {
    // you can access query parameters like "/?foo=bar" through `query.foo`

    // you can access the App instance through homey.app
    // const result = await homey.app.getSomething();
    // return result;

    // perform other logic like mapping result data

    return 'Hello from App';
  },

  async addSomething({ homey, body }) {
    // access the post body and perform some action on it.
    return homey.app.addSomething(body);
  },

  async updateSomething({ homey, params, body }) {
    return homey.app.setSomething(body);
  },

  async deleteSomething({ homey, params }) {
    return homey.app.deleteSomething(params.id);
  },

  async getForecast({ homey }) {
    try {
      // Get the driver
      const driver = await homey.drivers.getDriver('powerstatus');
      if (!driver) {
        throw new Error('PowerStatus driver not found');
      }

      // Get the device
      const devices = await driver.getDevices();
      const powerStatusDevice = devices[0];
      if (!powerStatusDevice) {
        throw new Error('No PowerStatus device found');
      }

      // Get the current values
      const peakDemand = powerStatusDevice.getCapabilityValue('peak_demand');
      const lowestMargin = powerStatusDevice.getCapabilityValue('lowest_margin');
      const lastUpdated = powerStatusDevice.getCapabilityValue('last_updated');

      // Get forecast data from device's detailed forecast
      const detailedForecast = await powerStatusDevice.fetchDetailedForecast();
      
      // Map forecast data to hourly margins
      const hourlyMargins = detailedForecast ? detailedForecast.map(point => ({
        hour: new Date(point.Timestamp).getHours(),
        margin: point.Margin || 0
      })) : [];

      return {
        peakDemand: Math.round(peakDemand) || 0,
        lowestMargin: Math.round(lowestMargin) || 0,
        lastUpdate: lastUpdated || new Date().toISOString(),
        forecast: hourlyMargins
      };
    } catch (error) {
      console.error('Error getting forecast:', error);
      return {
        peakDemand: 0,
        lowestMargin: 0,
        lastUpdate: new Date().toISOString(),
        forecast: []
      };
    }
  }
};
