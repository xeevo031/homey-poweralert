'use strict';

const { Device } = require('homey');
const fetch = require('node-fetch');

class PowerStatusDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('PowerStatus device has been initialized');

    // Initial update
    this.updatePowerAlertData();
    
    // Set up an interval to update data every 10 minutes
    this.updateInterval = this.homey.setInterval(() => {
      this.updatePowerAlertData();
    }, 10 * 60 * 1000); // 10 minutes
  }

  /**
   * onDeleted is called when the device is deleted.
   */
  async onDeleted() {
    this.log('PowerStatus device has been deleted');
    
    // Clear the update interval when the device is deleted
    if (this.updateInterval) {
      this.homey.clearInterval(this.updateInterval);
    }
  }

  /**
   * Get loadshedding stage from ColorId
   * @param {number} colorId - The color ID from the API
   * @returns {number} - The loadshedding stage
   */
  getStageFromColorId(colorId) {
    // Map ColorId to stage
    // 1 = Red = Stage 3-8
    // 2 = Green = Stage 0
    // 3 = Orange = Stage 1-2
    switch (colorId) {
      case 1: return 3; // Red - Using the lowest stage in this range
      case 2: return 0; // Green
      case 3: return 1; // Orange - Using the lowest stage in this range
      default: return 0;
    }
  }

  /**
   * Get probability percentage from ColorId
   * @param {number} colorId - The color ID from the API
   * @returns {number} - The probability percentage
   */
  getProbabilityFromColorId(colorId) {
    // Map ColorId to probability percentage
    // 1 = Red = 0-25%
    // 2 = Green = 75-100%
    // 3 = Orange = 25-75%
    switch (colorId) {
      case 1: return 10; // Red - Using a representative value
      case 2: return 90; // Green - Using a representative value
      case 3: return 50; // Orange - Using a representative value
      default: return 100;
    }
  }

  /**
   * Get status message from color and direction
   * @param {string} color - The color from the API
   * @param {string} direction - The direction from the API
   * @returns {string} - A user-friendly status message
   */
  getStatusMessage(color, direction) {
    return `The electricity grid is ${direction.toLowerCase()} and ${color.toLowerCase()}: ${this.getStatusDescription(color)}`;
  }

  /**
   * Get status description based on color
   * @param {string} color - The color from the API
   * @returns {string} - A description of the status
   */
  getStatusDescription(color) {
    switch (color.toLowerCase()) {
      case 'red':
        return 'The power system is under severe pressure.';
      case 'orange':
        return 'The power system is under pressure.';
      case 'green':
        return 'The power system is stable.';
      default:
        return 'Status unknown.';
    }
  }

  /**
   * Convert UTC date to SAST (South African Standard Time)
   * @param {Date} date - The UTC date to convert
   * @returns {string} - Formatted date string in SAST
   */
  formatSASTTime(date) {
    // SAST is UTC+2
    const options = {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    
    return new Intl.DateTimeFormat('en-ZA', options).format(date);
  }

  /**
   * Fetch and parse current system status from PowerAlert API
   */
  async fetchCurrentSystemStatus() {
    try {
      const url = 'https://www.poweralert.co.za/PowerAlertAPI/api/PowerAlertForecast/CurrentSystemStatus?callback=maintainCurrentStatus';
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const text = await response.text();
      
      // Parse JSONP response
      // Extract the JSON part from the JSONP response (remove the callback wrapper)
      const jsonStr = text.substring(text.indexOf('(') + 1, text.lastIndexOf(')'));
      const data = JSON.parse(jsonStr);
      
      return data;
    } catch (error) {
      this.error('Error fetching current system status:', error);
      return null;
    }
  }

  /**
   * Fetch and parse detailed forecast from PowerAlert API
   */
  async fetchDetailedForecast() {
    try {
      const url = 'https://www.poweralert.co.za/PowerAlertAPI/api/PowerAlertForecast/PowerAlertForecasts?callback=createChart';
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const text = await response.text();
      
      // Parse JSONP response
      // Extract the JSON part from the JSONP response (remove the callback wrapper)
      const jsonStr = text.substring(text.indexOf('(') + 1, text.lastIndexOf(')'));
      const data = JSON.parse(jsonStr);
      
      return data;
    } catch (error) {
      this.error('Error fetching detailed forecast:', error);
      return null;
    }
  }

  /**
   * Update device capabilities with data from PowerAlert APIs
   */
  async updatePowerAlertData() {
    try {
      this.log('Updating PowerAlert data...');
      
      // Fetch current system status
      const currentStatus = await this.fetchCurrentSystemStatus();
      if (currentStatus) {
        this.log('Current system status:', JSON.stringify(currentStatus));
        
        // Store the timestamp in UTC format internally
        const timestampUTC = new Date(currentStatus.Timestamp);
        this.setStoreValue('lastUpdateUTC', timestampUTC.toISOString());
        
        // Map API response to loadshedding stage
        const stage = this.getStageFromColorId(currentStatus.ColorId);
        const probability = this.getProbabilityFromColorId(currentStatus.ColorId);
        const statusMessage = this.getStatusMessage(currentStatus.Color, currentStatus.Direction);
        
        // Update capabilities with current status data
        await this.setCapabilityValue('loadshedding_stage', stage);
        await this.setCapabilityValue('power_probability', probability);
        await this.setCapabilityValue('status_message', statusMessage);
        
        // Trigger flows for stage changes if needed
        const previousStage = this.getStoreValue('previousStage');
        if (previousStage !== undefined && previousStage !== stage) {
          // Trigger a flow for stage change
          await this.homey.flow.getDeviceTriggerCard('stage_changed')
            .trigger(this, {
              previous_stage: previousStage,
              current_stage: stage
            });
        }
        
        // Store the current stage for future comparison
        this.setStoreValue('previousStage', stage);
      }
      
      // Fetch detailed forecast
      const detailedForecast = await this.fetchDetailedForecast();
      if (detailedForecast && detailedForecast.length > 0) {
        this.log('Detailed forecast count:', detailedForecast.length);
        
        // Process forecast data to find peak demand, available capacity, etc.
        let peakDemand = 0;
        let lowestMargin = Number.MAX_SAFE_INTEGER;
        let highestStage = 0;
        let availableCapacity = 0;
        
        // Find the peak demand and lowest margin in the forecast
        for (const dataPoint of detailedForecast) {
          const demand = dataPoint.LoadForecast || 0;
          const capacity = dataPoint.DeclaredAvailabilty || 0;
          const margin = capacity - demand;
          const stageValue = this.getStageFromColorId(dataPoint.ColorId);
          
          if (demand > peakDemand) {
            peakDemand = demand;
          }
          
          if (margin < lowestMargin) {
            lowestMargin = margin;
            availableCapacity = capacity;
          }
          
          if (stageValue > highestStage) {
            highestStage = stageValue;
          }
        }
        
        // Round values for display
        const roundedPeakDemand = Math.round(peakDemand);
        const roundedAvailableCapacity = Math.round(availableCapacity);
        const roundedLowestMargin = Math.round(lowestMargin);
        
        // Update capabilities with forecast data
        await this.setCapabilityValue('peak_demand', roundedPeakDemand);
        await this.setCapabilityValue('available_capacity', roundedAvailableCapacity);
        await this.setCapabilityValue('lowest_margin', roundedLowestMargin);
        await this.setCapabilityValue('forecast_highest_stage', highestStage);
      }
      
      // Update last updated timestamp in SAST format for display
      const now = new Date();
      const sastTime = this.formatSASTTime(now);
      await this.setCapabilityValue('last_updated', sastTime);
      
      this.log('PowerAlert data updated successfully');
    } catch (error) {
      this.error('Error updating PowerAlert data:', error);
    }
  }
}

module.exports = PowerStatusDevice; 