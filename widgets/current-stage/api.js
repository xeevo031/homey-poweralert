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

  async getStage({ homey }) {
    try {
      // Get the driver directly
      const driver = await homey.drivers.getDriver('powerstatus');
      if (!driver) {
        return {
          stage: 0,
          description: 'PowerStatus driver not found',
          lastUpdate: new Date().toISOString()
        };
      }

      // Get all devices for this driver
      const devices = await driver.getDevices();
      const powerStatusDevice = devices[0];

      if (!powerStatusDevice) {
        return {
          stage: 0,
          description: 'No PowerStatus device found',
          lastUpdate: new Date().toISOString()
        };
      }

      // Get the current stage and status
      const stage = powerStatusDevice.getCapabilityValue('loadshedding_stage');
      const statusMessage = powerStatusDevice.getCapabilityValue('status_message');
      const lastUpdated = powerStatusDevice.getCapabilityValue('last_updated');
      
      return {
        stage: stage || 0,
        description: statusMessage || 'No status available',
        lastUpdate: lastUpdated || new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting stage:', error);
      return {
        stage: 0,
        description: 'Error: ' + error.message,
        lastUpdate: new Date().toISOString()
      };
    }
  }
};
