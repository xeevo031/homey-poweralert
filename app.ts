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
    // Condition: probability_below
    this.homey.flow.getConditionCard('probability_below')
      .registerRunListener(async (args, state) => {
        const { device, threshold } = args;
        const currentProbability = device.getCapabilityValue('power_probability');
        return currentProbability < threshold;
      });

    // Condition: margin_below
    this.homey.flow.getConditionCard('margin_below')
      .registerRunListener(async (args, state) => {
        const { device, threshold } = args;
        const currentMargin = device.getCapabilityValue('current_declared_availability') - 
                            device.getCapabilityValue('current_load_forecast');
        return currentMargin < threshold;
      });

    // Condition: margin_above
    this.homey.flow.getConditionCard('margin_above')
      .registerRunListener(async (args, state) => {
        const { device, threshold } = args;
        const currentMargin = device.getCapabilityValue('current_declared_availability') - 
                            device.getCapabilityValue('current_load_forecast');
        return currentMargin > threshold;
      });

    // Condition: capacity_usage_above
    this.homey.flow.getConditionCard('capacity_usage_above')
      .registerRunListener(async (args, state) => {
        const { device, percentage } = args;
        const currentDemand = device.getCapabilityValue('current_load_forecast');
        const currentCapacity = device.getCapabilityValue('current_declared_availability');
        const usagePercentage = (currentDemand / currentCapacity) * 100;
        return usagePercentage > percentage;
      });

    // Condition: system_color_is
    this.homey.flow.getConditionCard('system_color_is')
      .registerRunListener(async (args, state) => {
        const { device, color } = args;
        const currentColor = device.getCapabilityValue('system_color');
        return currentColor === color.toLowerCase();
      });

    // Condition: system_direction_is
    this.homey.flow.getConditionCard('system_direction_is')
      .registerRunListener(async (args, state) => {
        const { device, direction } = args;
        const currentDirection = device.getCapabilityValue('system_direction');
        return currentDirection === direction.toLowerCase();
      });

    // Condition: system_critical
    this.homey.flow.getConditionCard('system_critical')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const margin = device.getCapabilityValue('current_declared_availability') - 
                      device.getCapabilityValue('current_load_forecast');
        return margin < device.getSetting('critical_margin');
      });

    // Condition: system_stable
    this.homey.flow.getConditionCard('system_stable')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const margin = device.getCapabilityValue('current_declared_availability') - 
                      device.getCapabilityValue('current_load_forecast');
        return margin > device.getSetting('stable_margin');
      });

    // Condition: system_improving
    this.homey.flow.getConditionCard('system_improving')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const direction = device.getCapabilityValue('system_direction');
        const trend = device.getCapabilityValue('trend_status');
        return direction === 'up' && trend === 'increasing';
      });
  }
  
  /**
   * Register flow action cards
   */
  _registerFlowActions() {
    // Action: check_system_state
    this.homey.flow.getActionCard('check_system_state')
      .registerRunListener(async (args, state) => {
        const { device, state: systemState } = args;
        let result = false;

        switch (systemState) {
          case 'critical':
            const margin = device.getCapabilityValue('current_declared_availability') - 
                         device.getCapabilityValue('current_load_forecast');
            result = margin < device.getSetting('critical_margin');
            break;
          case 'stable':
            const stableMargin = device.getCapabilityValue('current_declared_availability') - 
                               device.getCapabilityValue('current_load_forecast');
            result = stableMargin > device.getSetting('stable_margin');
            break;
          case 'improving':
            const direction = device.getCapabilityValue('system_direction');
            const trend = device.getCapabilityValue('trend_status');
            result = direction === 'up' && trend === 'increasing';
            break;
          case 'high_utilization':
            const currentDemand = device.getCapabilityValue('current_load_forecast');
            const currentCapacity = device.getCapabilityValue('current_declared_availability');
            const utilization = (currentDemand / currentCapacity) * 100;
            result = utilization > device.getSetting('high_utilization');
            break;
        }

        return result;
      });

    // Action: get_metrics
    this.homey.flow.getActionCard('get_metrics')
      .registerRunListener(async (args, state) => {
        const { device, metric } = args;
        let value = 0;

        switch (metric) {
          case 'margin':
            value = device.getCapabilityValue('current_declared_availability') - 
                   device.getCapabilityValue('current_load_forecast');
            break;
          case 'demand':
            value = device.getCapabilityValue('current_load_forecast');
            break;
          case 'capacity':
            value = device.getCapabilityValue('current_declared_availability');
            break;
          case 'utilization':
            const currentDemand = device.getCapabilityValue('current_load_forecast');
            const currentCapacity = device.getCapabilityValue('current_declared_availability');
            value = (currentDemand / currentCapacity) * 100;
            break;
          case 'reserve_margin':
            const margin = device.getCapabilityValue('current_declared_availability') - 
                         device.getCapabilityValue('current_load_forecast');
            const capacity = device.getCapabilityValue('current_declared_availability');
            value = (margin / capacity) * 100;
            break;
        }

        return value;
      });

    // Action: get_status_message
    this.homey.flow.getActionCard('get_status_message')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        return device.getCapabilityValue('status_message');
      });

    // Action: update_data
    this.homey.flow.getActionCard('update_data')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        await device.updateData();
        return true;
      });

    // Action: send_status_notification
    this.homey.flow.getActionCard('send_status_notification')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const statusMessage = device.getCapabilityValue('status_message');
        
        // Create notification
        await this.homey.notifications.createNotification({
          excerpt: statusMessage
        });
        
        return {
          status_message: statusMessage
        };
      });
  }
}

module.exports = PowerAlertApp;
