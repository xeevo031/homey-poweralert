'use strict';

module.exports = {
  async getProbabilities({ homey }) {
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
      const currentStage = powerStatusDevice.getCapabilityValue('loadshedding_stage');
      const currentProbability = powerStatusDevice.getCapabilityValue('power_probability');
      const lastUpdated = powerStatusDevice.getCapabilityValue('last_updated');
      
      // For now, we'll simulate evening and tomorrow probabilities
      // In a future update, these should come from actual forecast data
      const eveningProbability = Math.max(0, currentProbability - 10);
      const tomorrowProbability = Math.max(0, currentProbability - 20);

      return {
        current: {
          probability: currentProbability || 0,
          label: 'Current'
        },
        evening: {
          probability: eveningProbability || 0,
          label: 'Evening'
        },
        tomorrow: {
          probability: tomorrowProbability || 0,
          label: 'Tomorrow'
        },
        stage: currentStage || 0,
        lastUpdate: lastUpdated || new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting probabilities:', error);
      return {
        current: { probability: 0, label: 'Current' },
        evening: { probability: 0, label: 'Evening' },
        tomorrow: { probability: 0, label: 'Tomorrow' },
        stage: 0,
        lastUpdate: new Date().toISOString()
      };
    }
  },
};
