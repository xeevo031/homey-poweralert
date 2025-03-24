'use strict';

import Homey from 'homey';

class PowerAlertApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('PowerAlert app has been initialized');
    
    // Register flow condition cards
    this._registerFlowConditions();
    
    // Register flow action cards
    this._registerFlowActions();
  }
  
  /**
   * Register flow condition cards
   */
  _registerFlowConditions() {
    // Condition: stage_is
    this.homey.flow.getConditionCard('stage_is')
      .registerRunListener(async (args, state) => {
        const { device, stage } = args;
        const currentStage = device.getCapabilityValue('loadshedding_stage');
        return currentStage === parseInt(stage);
      });
      
    // Condition: probability_below
    this.homey.flow.getConditionCard('probability_below')
      .registerRunListener(async (args, state) => {
        const { device, threshold } = args;
        const currentProbability = device.getCapabilityValue('power_probability');
        return currentProbability < threshold;
      });
  }
  
  /**
   * Register flow action cards
   */
  _registerFlowActions() {
    // Action: update_data
    this.homey.flow.getActionCard('update_data')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        await device.updatePowerAlertData();
        return true;
      });
  }
}

module.exports = PowerAlertApp;
