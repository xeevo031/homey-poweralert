'use strict';

const { Device } = require('homey');
const fetch = require('node-fetch');

class PowerStatusDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('PowerStatus device has been initialized');

    // Initialize settings with defaults
    const marginThresholds = this.getSetting('margin_thresholds') || "1000,2000,3000,4000,5000,10000,15000,20000";
    const demandThresholds = this.getSetting('demand_thresholds') || "10000,20000,30000,40000,45000";
    const capacityThresholds = this.getSetting('capacity_thresholds') || "10000,20000,30000,40000,45000";

    this.settings = {
      margin_thresholds: this.parseThresholds(marginThresholds),
      demand_thresholds: this.parseThresholds(demandThresholds),
      capacity_thresholds: this.parseThresholds(capacityThresholds),
      critical_margin: this.getSetting('critical_margin') || 500,
      high_utilization: this.getSetting('high_utilization') || 90,
      stable_margin: this.getSetting('stable_margin') || 3000
    };

    // Get update interval from driver settings
    const updateInterval = this.getSetting('update_interval') || 5;

    // Validate settings
    this.validateSettings();

    // Register trigger cards
    this._colorChangedTrigger = this.homey.flow.getDeviceTriggerCard('system_color_changed')
      .registerRunListener(async (args, state) => {
        return (args.previous_color === state.previous_color && 
                args.current_color === state.current_color);
      });

    // Initialize daily color change counter
    this._lastDayColorChanges = 0;
    this._lastDayReset = new Date().setHours(0, 0, 0, 0);

    try {
      // Initial update with retry
      let retryCount = 0;
      const maxRetries = 3;
      let initialUpdateSuccess = false;

      while (!initialUpdateSuccess && retryCount < maxRetries) {
        try {
          this.log('Attempting initial data fetch...');
          await this.updatePowerAlertData();
          initialUpdateSuccess = true;
          this.log('Initial data fetch successful');
        } catch (error) {
          retryCount++;
          this.error(`Initial data fetch failed (attempt ${retryCount}/${maxRetries}):`, error);
          if (retryCount < maxRetries) {
            // Wait 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      if (!initialUpdateSuccess) {
        throw new Error('Failed to fetch initial data after multiple attempts');
      }

      // Start update interval only after successful initial update
      this.log(`Starting update interval (${updateInterval} minutes)`);
      this.updateInterval = this.homey.setInterval(async () => {
        try {
          await this.updatePowerAlertData();
        } catch (error) {
          this.error('Error in scheduled update:', error);
        }
      }, updateInterval * 60 * 1000);

      // Register all triggers
      await this.registerTriggers();

      // Register conditions
      await this.registerConditions();

      // Register actions
      await this.registerActions();
    } catch (error) {
      this.error('Error during device initialization:', error);
      throw error;
    }
  }

  /**
   * Parse comma-separated threshold values into array
   * @param {string} thresholds - Comma-separated threshold values
   * @returns {number[]} - Array of threshold values
   */
  parseThresholds(thresholds) {
    if (!thresholds || typeof thresholds !== 'string') {
      return [];
    }
    return thresholds.split(',')
      .map(t => parseInt(t.trim()))
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);
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
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    // Parse threshold settings
    if (changedKeys.includes('margin_thresholds')) {
      this.settings.margin_thresholds = this.parseThresholds(newSettings.margin_thresholds);
    }
    if (changedKeys.includes('demand_thresholds')) {
      this.settings.demand_thresholds = this.parseThresholds(newSettings.demand_thresholds);
    }
    if (changedKeys.includes('capacity_thresholds')) {
      this.settings.capacity_thresholds = this.parseThresholds(newSettings.capacity_thresholds);
    }

    // Update numeric settings
    if (changedKeys.includes('critical_margin')) {
      this.settings.critical_margin = newSettings.critical_margin;
    }
    if (changedKeys.includes('high_utilization')) {
      this.settings.high_utilization = newSettings.high_utilization;
    }
    if (changedKeys.includes('stable_margin')) {
      this.settings.stable_margin = newSettings.stable_margin;
    }

    // If update interval changed, reset the interval
    if (changedKeys.includes('update_interval')) {
      const updateInterval = newSettings.update_interval || 5;
      if (this.updateInterval) {
        this.homey.clearInterval(this.updateInterval);
      }
      this.updateInterval = this.homey.setInterval(async () => {
        try {
          await this.updatePowerAlertData();
        } catch (error) {
          this.error('Error in scheduled update:', error);
        }
      }, updateInterval * 60 * 1000);
    }

    // Validate new settings
    this.validateSettings();
  }

  /**
   * Validate settings and ensure they are within acceptable ranges
   */
  validateSettings() {
    // Validate arrays are not empty and contain valid numbers
    if (!Array.isArray(this.settings.margin_thresholds) || this.settings.margin_thresholds.length === 0) {
      this.error('Invalid margin thresholds, using defaults');
      this.settings.margin_thresholds = [1000, 2000, 3000, 4000, 5000, 10000, 15000, 20000];
    }
    if (!Array.isArray(this.settings.demand_thresholds) || this.settings.demand_thresholds.length === 0) {
      this.error('Invalid demand thresholds, using defaults');
      this.settings.demand_thresholds = [10000, 20000, 30000, 40000, 45000];
    }
    if (!Array.isArray(this.settings.capacity_thresholds) || this.settings.capacity_thresholds.length === 0) {
      this.error('Invalid capacity thresholds, using defaults');
      this.settings.capacity_thresholds = [10000, 20000, 30000, 40000, 45000];
    }

    // Validate single values
    if (typeof this.settings.critical_margin !== 'number' || this.settings.critical_margin < 0 || this.settings.critical_margin > 5000) {
      this.error('Invalid critical margin, using default');
      this.settings.critical_margin = 500;
    }
    if (typeof this.settings.high_utilization !== 'number' || this.settings.high_utilization < 0 || this.settings.high_utilization > 100) {
      this.error('Invalid high utilization threshold, using default');
      this.settings.high_utilization = 90;
    }
    if (typeof this.settings.stable_margin !== 'number' || this.settings.stable_margin < 0 || this.settings.stable_margin > 10000) {
      this.error('Invalid stable margin threshold, using default');
      this.settings.stable_margin = 3000;
    }
  }

  /**
   * Get margin status based on current margin and thresholds
   * @param {number} margin - Current power margin
   * @returns {string} - Status description
   */
  getMarginStatus(margin) {
    if (margin < this.settings.critical_margin) {
      return 'Critical situation';
    }
    
    // Find the appropriate threshold
    for (let i = 0; i < this.settings.margin_thresholds.length; i++) {
      if (margin < this.settings.margin_thresholds[i]) {
        const prevThreshold = i > 0 ? this.settings.margin_thresholds[i - 1] : 0;
        const nextThreshold = this.settings.margin_thresholds[i];
        const range = nextThreshold - prevThreshold;
        const position = margin - prevThreshold;
        const percentage = (position / range) * 100;
        
        if (percentage < 25) return 'Very tight margin';
        if (percentage < 50) return 'Tight margin';
        if (percentage < 75) return 'Moderate margin';
        return 'Comfortable margin';
      }
    }
    
    return 'Excellent margin';
  }

  /**
   * Get utilization status based on current utilization and thresholds
   * @param {number} utilization - Current utilization percentage
   * @returns {string} - Status description
   */
  getUtilizationStatus(utilization) {
    if (utilization > this.settings.high_utilization) {
      return 'System is operating at very high utilization';
    }
    if (utilization > this.settings.high_utilization - 5) {
      return 'System is operating at high utilization';
    }
    if (utilization > this.settings.high_utilization - 10) {
      return 'System is operating at moderate utilization';
    }
    return 'System has comfortable utilization levels';
  }

  /**
   * Get probability percentage from ColorId and margin
   * @param {number} colorId - The color ID from the API
   * @param {number} margin - The current power margin
   * @param {number} maxAvailability - The maximum available capacity
   * @returns {number} - The probability percentage
   */
  getProbabilityFromColorId(colorId, margin, maxAvailability) {
    // Calculate probability based on margin relative to max availability
    const marginPercentage = (margin / maxAvailability) * 100;
    
    // Adjust probability based on color and direction
    switch (colorId) {
      case 1: // Red
      case 4: // Red
        return Math.max(0, Math.min(25, marginPercentage));
      case 2: // Green
        return Math.max(75, Math.min(100, marginPercentage));
      case 3: // Orange
        return Math.max(25, Math.min(75, marginPercentage));
      default: return 100;
    }
  }

  /**
   * Get status description based on color, direction, and metrics
   * @param {string} color - The color from the API
   * @param {string} direction - The direction from the API
   * @param {number} margin - Current power margin
   * @param {number} capacity - Current available capacity
   * @param {number} demand - Current load forecast
   * @param {number} peakDemand - Peak demand from forecast
   * @param {number} lowestMargin - Lowest margin from forecast
   * @param {number} averageMargin - Average margin from forecast
   * @returns {string} - A concise description of the status
   */
  getStatusDescription(color, direction, margin, capacity, demand, peakDemand, lowestMargin, averageMargin) {
    const utilizationPercentage = ((demand / capacity) * 100).toFixed(1);
    const formattedMargin = Math.round(margin).toLocaleString();
    const marginStatus = this.getMarginStatus(margin);
    
    let statusDescription = '';
    
    // Grid status based on color
    switch (color.toLowerCase()) {
      case 'red':
        statusDescription = `The Eskom grid is under severe pressure. `;
        break;
      case 'orange':
        statusDescription = `The Eskom grid is under pressure. `;
        break;
      case 'green':
        statusDescription = `The Eskom grid is stable. `;
        break;
      default:
        statusDescription = `Eskom grid status unknown. `;
    }

    // Add margin and utilization
    statusDescription += `Margin: ${formattedMargin} MW (${marginStatus}). `;
    statusDescription += `${utilizationPercentage}% utilization. `;

    // Add trend
    switch (direction.toLowerCase()) {
      case 'up':
        statusDescription += 'Demand increasing.';
        break;
      case 'down':
        statusDescription += 'Demand decreasing.';
        break;
      case 'stable':
        statusDescription += 'Demand stable.';
        break;
      default:
        statusDescription += 'Trend unknown.';
    }

    return statusDescription;
  }

  /**
   * Get status message from color and direction
   * @param {string} color - The color from the API
   * @param {string} direction - The direction from the API
   * @returns {string} - A user-friendly status message
   */
  getStatusMessage(color, direction) {
    const margin = this.getCapabilityValue('current_declared_availability') - 
                  this.getCapabilityValue('current_load_forecast');
    const capacity = this.getCapabilityValue('current_declared_availability');
    const demand = this.getCapabilityValue('current_load_forecast');
    const peakDemand = this.getCapabilityValue('peak_demand');
    const lowestMargin = this.getCapabilityValue('lowest_margin');
    const averageMargin = this.getCapabilityValue('average_margin');
    
    return this.getStatusDescription(color, direction, margin, capacity, demand, peakDemand, lowestMargin, averageMargin);
  }

  /**
   * Format a date string in SAST time to UTC for storage in Homey
   * @param {string} date - The date string in SAST
   * @returns {string} The formatted date string in UTC
   */
  formatSASTTime(date) {
    try {
      // Parse the SAST date
      const sastDate = new Date(date);
      
      // Format the date in SAST format (YYYY-MM-DD HH:mm)
      const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Africa/Johannesburg'
      };
      
      return sastDate.toLocaleString('en-ZA', options).replace(/[\/]/g, '-').replace(/,/g, '');
    } catch (error) {
      this.error('Error formatting SAST time:', error);
      return new Date(date).toLocaleString('en-ZA', {
        timeZone: 'Africa/Johannesburg'
      }).replace(/[\/]/g, '-').replace(/,/g, '');
    }
  }

  /**
   * Fetch and parse detailed forecast from PowerAlert API
   */
  async fetchDetailedForecast() {
    try {
      const url = 'https://www.poweralert.co.za/PowerAlertAPI/api/PowerAlertForecast/PowerAlertForecasts?callback=createChart';
      this.log('Fetching data from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const text = await response.text();
      this.log('Received response text:', text.substring(0, 100) + '...');
      
      // Parse JSONP response
      // Extract the JSON part from the JSONP response (remove the callback wrapper)
      const startIndex = text.indexOf('createChart(');
      if (startIndex === -1) {
        throw new Error('Invalid JSONP response format: missing createChart callback');
      }
      
      const endIndex = text.lastIndexOf(')');
      if (endIndex === -1) {
        throw new Error('Invalid JSONP response format: missing closing parenthesis');
      }
      
      const jsonStr = text.substring(startIndex + 'createChart('.length, endIndex);
      if (!jsonStr.trim()) {
        throw new Error('Empty JSON data in JSONP response');
      }
      
      try {
        const data = JSON.parse(jsonStr);
        if (!Array.isArray(data)) {
          throw new Error('Parsed data is not an array');
        }
        if (data.length === 0) {
          throw new Error('Empty data array');
        }
        this.log('Successfully parsed forecast data with', data.length, 'entries');
        return data;
      } catch (parseError) {
        throw new Error(`Failed to parse JSON data: ${parseError.message}`);
      }
    } catch (error) {
      this.error('Error fetching detailed forecast:', error);
      return null;
    }
  }

  /**
   * Get current hour's data from forecast
   * @param {Array} forecast - Forecast data array
   * @returns {Object} - Current hour data
   */
  getCurrentHourData(forecast) {
    const now = new Date();
    const sastHour = (now.getUTCHours() + 2) % 24; // Convert UTC to SAST by adding 2 hours
    
    // Find the entry that matches the current SAST hour
    const currentHourData = forecast.find(dataPoint => {
      const dataTime = new Date(dataPoint.Timestamp);
      const dataHour = dataTime.getHours();
      return dataHour === sastHour;
    });

    if (currentHourData) {
      return currentHourData;
    }

    return forecast[0]; // Fallback to first entry if current hour not found
  }

  /**
   * Get trend status from DirectionId
   * @param {number} directionId - The direction ID from the API
   * @returns {string} - A description of the trend
   */
  getTrendStatus(directionId) {
    switch (directionId) {
      case 1: return 'increasing';
      case 2: return 'decreasing';
      case 3: return 'stable';
      default: return 'stable';
    }
  }

  getSystemDirection(directionId) {
    switch (directionId) {
      case 1: return 'up';
      case 2: return 'down';
      case 3: return 'stable';
      default: return 'stable';
    }
  }

  /**
   * Update device capabilities with data from PowerAlert API
   */
  async updatePowerAlertData() {
    try {
      // Store previous values for threshold comparisons
      const previousCapacity = this.getCapabilityValue('current_declared_availability');
      const previousDemand = this.getCapabilityValue('current_load_forecast');
      const previousMargin = previousCapacity - previousDemand;

      // Fetch the forecast data first
      const forecast = await this.fetchDetailedForecast();
      if (!forecast) {
        throw new Error('Failed to fetch forecast data');
      }

      // Get current hour data
      const currentStatus = this.getCurrentHourData(forecast);
      if (!currentStatus) {
        throw new Error('Failed to get current hour data');
      }

      // Calculate aggregated values from forecast data
      const aggregatedData = forecast.reduce((acc, entry) => {
        // Update peak demand
        if (!acc.peakDemand || entry.LoadForecast > acc.peakDemand) {
          acc.peakDemand = entry.LoadForecast;
        }

        // Update lowest margin
        const margin = entry.DeclaredAvailabilty - entry.LoadForecast;
        if (!acc.lowestMargin || margin < acc.lowestMargin) {
          acc.lowestMargin = margin;
        }

        // Update max/min values
        if (!acc.maxLoadForecast || entry.LoadForecast > acc.maxLoadForecast) {
          acc.maxLoadForecast = entry.LoadForecast;
        }
        if (!acc.minLoadForecast || entry.LoadForecast < acc.minLoadForecast) {
          acc.minLoadForecast = entry.LoadForecast;
        }
        if (!acc.maxDeclaredAvailability || entry.DeclaredAvailabilty > acc.maxDeclaredAvailability) {
          acc.maxDeclaredAvailability = entry.DeclaredAvailabilty;
        }
        if (!acc.minDeclaredAvailability || entry.DeclaredAvailabilty < acc.minDeclaredAvailability) {
          acc.minDeclaredAvailability = entry.DeclaredAvailabilty;
        }
        if (!acc.maxMaxAvailability || entry.MaxAvailability > acc.maxMaxAvailability) {
          acc.maxMaxAvailability = entry.MaxAvailability;
        }
        if (!acc.minMaxAvailability || entry.MaxAvailability < acc.minMaxAvailability) {
          acc.minMaxAvailability = entry.MaxAvailability;
        }

        // Accumulate values for averages
        acc.totalDemand += entry.LoadForecast;
        acc.totalCapacity += entry.DeclaredAvailabilty;
        acc.totalMaxAvailability += entry.MaxAvailability;
        acc.totalMargin += (entry.DeclaredAvailabilty - entry.LoadForecast);
        acc.count++;

        return acc;
      }, {
        peakDemand: null,
        lowestMargin: null,
        maxLoadForecast: null,
        minLoadForecast: null,
        maxDeclaredAvailability: null,
        minDeclaredAvailability: null,
        maxMaxAvailability: null,
        minMaxAvailability: null,
        totalDemand: 0,
        totalCapacity: 0,
        totalMaxAvailability: 0,
        totalMargin: 0,
        count: 0
      });

      // Calculate averages
      const averageCapacity = aggregatedData.totalCapacity / aggregatedData.count;
      const averageDemand = aggregatedData.totalDemand / aggregatedData.count;
      const averageMaxAvailability = aggregatedData.totalMaxAvailability / aggregatedData.count;
      const averageMargin = aggregatedData.totalMargin / aggregatedData.count;

      // Format the current date - API data is in SAST, convert to UTC for Homey
      const now = new Date();
      const formattedDate = this.formatSASTTime(now);
      
      // Get previous color before updating
      const previousColor = this.getCapabilityValue('system_color');
      
      // Update the system color first
      const newColor = currentStatus.Color.toLowerCase();
      await this.setCapabilityValue('system_color', newColor);

      // Update basic capabilities
      await this.setCapabilityValue('status_message', this.getStatusMessage(newColor, currentStatus.Direction));
      await this.setCapabilityValue('last_updated', formattedDate);

      // Prepare all capability updates
      const capabilities = {
        power_probability: this.getProbabilityFromColorId(
          currentStatus.ColorId,
          currentStatus.DeclaredAvailabilty - currentStatus.LoadForecast,
          currentStatus.MaxAvailability
        ),
        peak_demand: aggregatedData.peakDemand,
        available_capacity: currentStatus.DeclaredAvailabilty,
        lowest_margin: aggregatedData.lowestMargin,
        average_capacity: averageCapacity,
        current_load_forecast: currentStatus.LoadForecast,
        current_declared_availability: currentStatus.DeclaredAvailabilty,
        current_max_availability: currentStatus.MaxAvailability,
        average_max_availability: averageMaxAvailability,
        max_max_availability: aggregatedData.maxMaxAvailability,
        min_max_availability: aggregatedData.minMaxAvailability,
        max_load_forecast: aggregatedData.maxLoadForecast,
        min_load_forecast: aggregatedData.minLoadForecast,
        max_declared_availability: aggregatedData.maxDeclaredAvailability,
        min_declared_availability: aggregatedData.minDeclaredAvailability,
        average_margin: averageMargin,
        average_demand: averageDemand,
        system_direction: this.getSystemDirection(currentStatus.DirectionId),
        trend_status: this.getTrendStatus(currentStatus.DirectionId)
      };

      // Update each capability with proper error handling
      for (const [capability, value] of Object.entries(capabilities)) {
        try {
          if (value !== null && value !== undefined) {
            await this.setCapabilityValue(capability, typeof value === 'string' ? value : Math.round(value));
          }
        } catch (error) {
          this.error(`Error setting ${capability}:`, error);
        }
      }

      // Calculate and update power margin
      try {
        const margin = currentStatus.DeclaredAvailabilty - currentStatus.LoadForecast;
        if (margin !== null && margin !== undefined) {
          this.power_margin = Math.round(margin);
        }
      } catch (error) {
        this.error('Error calculating power margin:', error);
      }

      // Log only significant changes
      if (previousColor !== newColor) {
        this.log(`System color changed from ${previousColor} to ${newColor}`);
      }

      // Log completion with minimal data
      this.log(`Status: ${newColor}/${currentStatus.Direction} | Margin: ${this.power_margin}MW`);

    } catch (error) {
      this.error('Error updating PowerAlert data:', error);
      throw error;
    }
  }

  /**
   * Check if system is in critical state
   */
  isSystemCritical() {
    const margin = this.getCapabilityValue('current_declared_availability') - 
                  this.getCapabilityValue('current_load_forecast');
    return margin < this.settings.critical_margin;
  }

  /**
   * Check if system utilization is above threshold
   */
  isUtilizationAbove(threshold) {
    const capacity = this.getCapabilityValue('current_declared_availability');
    const demand = this.getCapabilityValue('current_load_forecast');
    const utilization = (demand / capacity) * 100;
    return utilization > threshold;
  }

  /**
   * Check if system is improving
   */
  isSystemImproving() {
    const direction = this.getCapabilityValue('system_direction');
    const margin = this.getCapabilityValue('current_declared_availability') - 
                  this.getCapabilityValue('current_load_forecast');
    return direction === 'down' && margin > this.settings.stable_margin;
  }

  /**
   * Check if system is stable
   */
  isSystemStable() {
    const direction = this.getCapabilityValue('system_direction');
    const margin = this.getCapabilityValue('current_declared_availability') - 
                  this.getCapabilityValue('current_load_forecast');
    return direction === 'stable' && margin > this.settings.stable_margin;
  }

  /**
   * Get specific power metrics
   * @param {Object} args - The action arguments
   * @param {string} args.metric - The metric to get
   * @returns {number} - The requested metric value
   */
  getMetrics(args) {
    const { metric } = args;
    const demand = this.getCapabilityValue('current_load_forecast');
    const capacity = this.getCapabilityValue('current_declared_availability');
          const margin = capacity - demand;
    
    switch (metric) {
      case 'margin':
        return margin;
      case 'demand':
        return demand;
      case 'capacity':
        return capacity;
      case 'utilization':
        return (demand / capacity) * 100;
      case 'reserve_margin':
        return (margin / demand) * 100;
      default:
        throw new Error(`Unknown metric: ${metric}`);
    }
  }

  /**
   * Check if system is in a specific state
   * @param {Object} args - The action arguments
   * @param {string} args.state - The state to check
   * @returns {boolean} - True if system is in the specified state
   */
  checkSystemState(args) {
    const { state } = args;
    
    switch (state) {
      case 'critical':
        return this.isSystemCritical();
      case 'stable':
        return this.isSystemStable();
      case 'improving':
        return this.isSystemImproving();
      case 'high_utilization':
        return this.isUtilizationAbove(this.settings.high_utilization);
      default:
        throw new Error(`Unknown state: ${state}`);
    }
  }

  /**
   * Register all triggers
   */
  async registerTriggers() {
    // Register existing triggers
    this.forecastTimePeriodTrigger = this.homey.flow.getDeviceTriggerCard('forecast_time_period_status');
    this.peakDemandTimeTrigger = this.homey.flow.getDeviceTriggerCard('peak_demand_time');
    this.statusDurationTrigger = this.homey.flow.getDeviceTriggerCard('status_duration_exceeded');
    this.rapidStatusChangeTrigger = this.homey.flow.getDeviceTriggerCard('rapid_status_change');

    // Register threshold triggers
    this.powerCapacityThresholdTrigger = this.homey.flow.getDeviceTriggerCard('power_capacity_threshold')
      .registerRunListener(async (args, state) => {
        const currentCapacity = this.getCapabilityValue('current_declared_availability');
        if (args.direction === 'above') {
          return currentCapacity > args.threshold;
        }
        return currentCapacity < args.threshold;
      });

    this.powerDemandThresholdTrigger = this.homey.flow.getDeviceTriggerCard('power_demand_threshold')
      .registerRunListener(async (args, state) => {
        const currentDemand = this.getCapabilityValue('current_load_forecast');
        if (args.direction === 'above') {
          return currentDemand > args.threshold;
        }
        return currentDemand < args.threshold;
      });

    this.powerMarginThresholdTrigger = this.homey.flow.getDeviceTriggerCard('power_margin_threshold')
      .registerRunListener(async (args, state) => {
        const currentMargin = this.getCapabilityValue('current_declared_availability') - 
                            this.getCapabilityValue('current_load_forecast');
        if (args.direction === 'above') {
          return currentMargin > args.threshold;
        }
        return currentMargin < args.threshold;
      });

    // Initialize status tracking
    this.lastStatusChange = new Date();
    this.currentStatus = null;
  }

  /**
   * Check time period status in forecast
   * @param {Array} forecast - Forecast data
   */
  checkTimePeriodStatus(forecast) {
    const timePeriods = {
      morning: { start: 6, end: 9 },
      midday: { start: 11, end: 14 },
      evening: { start: 18, end: 21 }
    };

    for (const [periodId, period] of Object.entries(timePeriods)) {
      const periodData = forecast.filter(entry => {
        const hour = new Date(entry.Timestamp).getHours();
        return hour >= period.start && hour <= period.end;
      });

      if (periodData.length > 0) {
        const status = periodData[0].Color.toLowerCase();
        this.forecastTimePeriodTrigger.trigger(this, {}, { time_period: periodId, status: status });
      }
    }
  }

  /**
   * Check for peak demand time
   * @param {Array} forecast - Forecast data
   */
  checkPeakDemand(forecast) {
    const peakEntry = forecast.reduce((max, entry) => 
      entry.LoadForecast > max.LoadForecast ? entry : max
    );

    if (peakEntry) {
      const peakTime = new Date(peakEntry.Timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      });

      this.peakDemandTimeTrigger.trigger(this, {
        peak_time: peakTime,
        peak_demand: peakEntry.LoadForecast,
        system_color: peakEntry.Color
      });
    }
  }

  /**
   * Check status duration
   * @param {string} currentStatus - Current system status
   */
  checkStatusDuration(currentStatus) {
    if (this.currentStatus !== currentStatus) {
      this.currentStatus = currentStatus;
      this.lastStatusChange = new Date();
      
      // Trigger rapid status change if applicable
      if (this.previousStatus) {
        this.rapidStatusChangeTrigger.trigger(this, {}, {
          from_status: this.previousStatus.toLowerCase(),
          to_status: currentStatus.toLowerCase()
        });
      }
      this.previousStatus = currentStatus;
    } else {
      const duration = Math.floor((new Date() - this.lastStatusChange) / (1000 * 60)); // Duration in minutes
      this.statusDurationTrigger.trigger(this, {}, {
        status: currentStatus.toLowerCase(),
        duration: duration
      });
    }
  }

  /**
   * Register all conditions
   */
  async registerConditions() {
    // Register forecast contains status condition
    this.homey.flow.getConditionCard('forecast_contains_status')
      .registerRunListener(async (args, state) => {
        const forecast = await this.fetchDetailedForecast();
        if (!forecast) return false;

        const hoursToCheck = args.hours;
        const targetStatus = args.status;
      const now = new Date();
        const endTime = new Date(now.getTime() + (hoursToCheck * 60 * 60 * 1000));

        return forecast.some(entry => {
          const entryTime = new Date(entry.Timestamp);
          return entryTime <= endTime && 
                 entry.Color.toLowerCase() === targetStatus;
        });
      });

    // Register status trending direction condition
    this.homey.flow.getConditionCard('status_trending_direction')
      .registerRunListener(async (args, state) => {
        const forecast = await this.fetchDetailedForecast();
        if (!forecast) return false;

        const direction = args.direction;
        const trendData = this.analyzeTrend(forecast);

        switch (direction) {
          case 'improving':
            return trendData.marginTrend > 0 && trendData.colorTrend < 0;
          case 'worsening':
            return trendData.marginTrend < 0 && trendData.colorTrend > 0;
          case 'stable':
            return Math.abs(trendData.marginTrend) < 100 && trendData.colorTrend === 0;
          default:
            return false;
        }
      });

    // Register time until status change condition
    this.homey.flow.getConditionCard('time_until_status_change')
      .registerRunListener(async (args, state) => {
        const forecast = await this.fetchDetailedForecast();
        if (!forecast) return false;

        const fromStatus = args.from_status;
        const toStatus = args.to_status;
        const hoursToCheck = args.hours;
        const now = new Date();
        const endTime = new Date(now.getTime() + (hoursToCheck * 60 * 60 * 1000));

        let foundFromStatus = false;
        for (const entry of forecast) {
          const entryTime = new Date(entry.Timestamp);
          if (entryTime > endTime) break;

          const currentStatus = entry.Color.toLowerCase();
          if (!foundFromStatus && currentStatus === fromStatus) {
            foundFromStatus = true;
          } else if (foundFromStatus && currentStatus === toStatus) {
            return true;
          }
        }
        return false;
      });

    // Register utilization rate of change condition
    this.homey.flow.getConditionCard('utilization_rate_of_change')
      .registerRunListener(async (args, state) => {
        const forecast = await this.fetchDetailedForecast();
        if (!forecast || forecast.length < 2) return false;

        const direction = args.direction;
        const targetRate = args.rate;
        const rateOfChange = this.calculateUtilizationRateOfChange(forecast);

        if (direction === 'increasing') {
          return rateOfChange >= targetRate;
        } else {
          return rateOfChange <= -targetRate;
        }
      });
  }

  /**
   * Analyze trend in forecast data
   * @param {Array} forecast - Forecast data
   * @returns {Object} - Trend analysis results
   */
  analyzeTrend(forecast) {
    const colorValues = { green: 1, yellow: 2, orange: 3, red: 4 };
    let marginSum = 0;
    let colorSum = 0;
    const dataPoints = Math.min(6, forecast.length); // Look at next 6 hours

    for (let i = 0; i < dataPoints; i++) {
      const entry = forecast[i];
      const margin = entry.DeclaredAvailabilty - entry.LoadForecast;
      marginSum += margin * (dataPoints - i); // Weight recent points more heavily
      colorSum += colorValues[entry.Color.toLowerCase()] * (dataPoints - i);
    }

    const marginTrend = marginSum / ((dataPoints * (dataPoints + 1)) / 2);
    const colorTrend = colorSum / ((dataPoints * (dataPoints + 1)) / 2);

    return {
      marginTrend,
      colorTrend
    };
  }

  /**
   * Calculate utilization rate of change
   * @param {Array} forecast - Forecast data
   * @returns {number} - Rate of change in percent per hour
   */
  calculateUtilizationRateOfChange(forecast) {
    const current = forecast[0];
    const next = forecast[1];
    
    const currentUtilization = (current.LoadForecast / current.DeclaredAvailabilty) * 100;
    const nextUtilization = (next.LoadForecast / next.DeclaredAvailabilty) * 100;
    
    return nextUtilization - currentUtilization;
  }

  /**
   * Register all actions
   */
  async registerActions() {
    // Register get optimal energy period action
    this.homey.flow.getActionCard('get_optimal_energy_period')
      .registerRunListener(async (args) => {
        const forecast = await this.fetchDetailedForecast();
        if (!forecast) throw new Error('Unable to fetch forecast data');

        const result = this.findOptimalEnergyPeriod(
          forecast,
          args.duration,
          args.start_time,
          args.end_time
        );

        return {
          optimal_start: result.startTime,
          average_demand: result.averageDemand,
          system_color: result.systemColor
        };
      });

    // Register get status forecast timeline action
    this.homey.flow.getActionCard('get_status_forecast_timeline')
      .registerRunListener(async (args) => {
        const forecast = await this.fetchDetailedForecast();
        if (!forecast) throw new Error('Unable to fetch forecast data');

        const result = this.generateStatusTimeline(forecast, args.hours);

        return {
          timeline: result.timeline,
          status_changes: result.statusChanges,
          worst_period: result.worstPeriod
        };
      });

    // Register calculate energy risk score action
    this.homey.flow.getActionCard('calculate_energy_risk_score')
      .registerRunListener(async (args) => {
        const forecast = await this.fetchDetailedForecast();
        if (!forecast) throw new Error('Unable to fetch forecast data');

        const result = this.calculateRiskScore(forecast, args.sensitivity);

        return {
          risk_score: result.score,
          risk_level: result.level,
          recommendation: result.recommendation
        };
      });

    // Register export historical data action
    this.homey.flow.getActionCard('export_historical_data')
      .registerRunListener(async (args) => {
        const data = await this.getHistoricalData(args.hours);
        const result = await this.exportData(data, args.format);

        return {
          export_url: result.url,
          record_count: result.count,
          export_time: result.timestamp
        };
      });
  }

  /**
   * Find optimal energy period based on forecast
   * @param {Array} forecast - Forecast data
   * @param {number} duration - Duration in minutes
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @returns {Object} - Optimal period details
   */
  findOptimalEnergyPeriod(forecast, duration, startTime, endTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const durationHours = duration / 60;

    let bestStartTime = null;
    let lowestAverageDemand = Infinity;
    let bestColor = null;

    for (let i = 0; i < forecast.length - durationHours; i++) {
      const periodStart = new Date(forecast[i].Timestamp);
      const hour = periodStart.getHours();
      const minute = periodStart.getMinutes();

      // Check if within allowed time window
      if (hour < startHour || hour > endHour || 
          (hour === endHour && minute > endMinute) ||
          (hour === startHour && minute < startMinute)) {
        continue;
      }

      // Calculate average demand for this period
      let totalDemand = 0;
      let worstColor = 'green';
      const colorValues = { green: 1, yellow: 2, orange: 3, red: 4 };
      
      for (let j = 0; j < durationHours; j++) {
        if (i + j >= forecast.length) break;
        totalDemand += forecast[i + j].LoadForecast;
        if (colorValues[forecast[i + j].Color.toLowerCase()] > 
            colorValues[worstColor]) {
          worstColor = forecast[i + j].Color.toLowerCase();
        }
      }

      const averageDemand = totalDemand / durationHours;
      if (averageDemand < lowestAverageDemand) {
        lowestAverageDemand = averageDemand;
        bestStartTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        bestColor = worstColor;
      }
    }

    return {
      startTime: bestStartTime || startTime,
      averageDemand: Math.round(lowestAverageDemand),
      systemColor: bestColor || 'unknown'
    };
  }

  /**
   * Generate status timeline from forecast
   * @param {Array} forecast - Forecast data
   * @param {number} hours - Hours to include
   * @returns {Object} - Timeline details
   */
  generateStatusTimeline(forecast, hours) {
    let timeline = '';
    let statusChanges = 0;
    let worstPeriod = '';
    let worstColorValue = 0;
    const colorValues = { green: 1, yellow: 2, orange: 3, red: 4 };

    let currentStatus = null;
    let currentStartTime = null;
    let periodStart = null;

    for (let i = 0; i < Math.min(forecast.length, hours); i++) {
      const entry = forecast[i];
      const time = new Date(entry.Timestamp);
      const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

      if (currentStatus !== entry.Color) {
        if (currentStatus !== null) {
          timeline += `${currentStartTime}-${timeStr}: ${currentStatus} (${entry.Direction})\n`;
          statusChanges++;
        }
        currentStatus = entry.Color;
        currentStartTime = timeStr;
      }

      // Track worst period
      const colorValue = colorValues[entry.Color.toLowerCase()];
      if (colorValue > worstColorValue) {
        worstColorValue = colorValue;
        worstPeriod = `${timeStr}-${(time.getHours() + 1).toString().padStart(2, '0')}:00 (${entry.Color})`;
      }
    }

    // Add final period
    if (currentStatus) {
      const lastTime = new Date(forecast[Math.min(forecast.length - 1, hours - 1)].Timestamp);
      const lastTimeStr = `${(lastTime.getHours() + 1).toString().padStart(2, '0')}:00`;
      timeline += `${currentStartTime}-${lastTimeStr}: ${currentStatus} (${forecast[forecast.length - 1].Direction})\n`;
    }

    return {
      timeline: timeline.trim(),
      statusChanges,
      worstPeriod
    };
  }

  /**
   * Calculate risk score based on forecast
   * @param {Array} forecast - Forecast data
   * @param {string} sensitivity - Risk sensitivity level
   * @returns {Object} - Risk assessment details
   */
  calculateRiskScore(forecast, sensitivity) {
    const weights = {
      low: { color: 0.4, margin: 0.3, trend: 0.3 },
      medium: { color: 0.5, margin: 0.3, trend: 0.2 },
      high: { color: 0.6, margin: 0.3, trend: 0.1 }
    };

    const w = weights[sensitivity];
    let colorScore = 0;
    let marginScore = 0;
    let trendScore = 0;

    // Calculate color score
    const colorValues = { green: 25, yellow: 50, orange: 75, red: 100 };
    colorScore = colorValues[forecast[0].Color.toLowerCase()] || 50;

    // Calculate margin score
    const currentMargin = forecast[0].DeclaredAvailabilty - forecast[0].LoadForecast;
    const marginPercentage = (currentMargin / forecast[0].DeclaredAvailabilty) * 100;
    marginScore = Math.max(0, Math.min(100, 100 - marginPercentage));

    // Calculate trend score
    const trendData = this.analyzeTrend(forecast);
    trendScore = trendData.marginTrend < 0 ? 75 : trendData.marginTrend > 0 ? 25 : 50;

    // Calculate weighted score
    const score = Math.round(
      (colorScore * w.color) +
      (marginScore * w.margin) +
      (trendScore * w.trend)
    );

    // Determine risk level and recommendation
    let level, recommendation;
    if (score >= 75) {
      level = 'High';
      recommendation = 'Immediately reduce non-essential power usage';
    } else if (score >= 50) {
      level = 'Medium';
      recommendation = 'Consider postponing energy-intensive activities';
    } else {
      level = 'Low';
      recommendation = 'Safe to proceed with normal activities';
    }

    return {
      score,
      level,
      recommendation
    };
  }

  /**
   * Get historical data for export
   * @param {number} hours - Hours of history to retrieve
   * @returns {Array} - Historical data
   */
  async getHistoricalData(hours) {
    const forecast = await this.fetchDetailedForecast();
    if (!forecast) return [];

    return forecast.slice(0, hours).map(entry => ({
      timestamp: entry.Timestamp,
      color: entry.Color,
      direction: entry.Direction,
      demand: entry.LoadForecast,
      capacity: entry.DeclaredAvailabilty,
      maxAvailability: entry.MaxAvailability,
      margin: entry.DeclaredAvailabilty - entry.LoadForecast
    }));
  }

  /**
   * Export data to specified format
   * @param {Array} data - Data to export
   * @param {string} format - Export format
   * @returns {Object} - Export details
   */
  async exportData(data, format) {
    const timestamp = this.formatSASTTime(new Date()).replace(/[/:]/g, '-');
    let content = '';
    let mimeType = '';

    if (format === 'csv') {
      // Generate CSV content
      const headers = ['Timestamp', 'Color', 'Direction', 'Demand', 'Capacity', 'MaxAvailability', 'Margin'];
      content = [
        headers.join(','),
        ...data.map(row => [
          row.timestamp,
          row.color,
          row.direction,
          row.demand,
          row.capacity,
          row.maxAvailability,
          row.margin
        ].join(','))
      ].join('\n');
      mimeType = 'text/csv';
    } else {
      // Generate JSON content
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
    }

    // Return data in a format suitable for email or other actions
    return {
      content: content,
      mime_type: mimeType,
      filename: `power-alert-export-${timestamp}.${format}`,
      record_count: data.length,
      export_time: timestamp,
      data_summary: {
        start_time: data[0]?.timestamp,
        end_time: data[data.length - 1]?.timestamp,
        color_changes: this.countColorChanges(data),
        average_demand: this.calculateAverageDemand(data),
        average_margin: this.calculateAverageMargin(data)
      }
    };
  }

  /**
   * Count color changes in the data
   * @param {Array} data - Historical data
   * @returns {number} - Number of color changes
   */
  countColorChanges(data) {
    // If data is undefined or not an array, return the stored count
    if (!data || !Array.isArray(data)) {
      return this._lastDayColorChanges || 0;
    }
    
    let changes = 0;
    let previousColor = null;
    
    for (const entry of data) {
      if (previousColor && previousColor !== entry.color) {
        changes++;
      }
      previousColor = entry.color;
    }
    
    return changes;
  }

  /**
   * Calculate average demand
   * @param {Array} data - Historical data
   * @returns {number} - Average demand
   */
  calculateAverageDemand(data) {
    const sum = data.reduce((acc, entry) => acc + entry.demand, 0);
    return Math.round(sum / data.length);
  }

  /**
   * Calculate average margin
   * @param {Array} data - Historical data
   * @returns {number} - Average margin
   */
  calculateAverageMargin(data) {
    const sum = data.reduce((acc, entry) => acc + entry.margin, 0);
    return Math.round(sum / data.length);
  }

  async onSystemColorChanged(oldColor, newColor) {
    try {
      // Increment color changes counter
      const today = new Date();
      const todayStart = today.setHours(0, 0, 0, 0);
      
      if (this._lastDayReset !== todayStart) {
        this._lastDayColorChanges = 0;
        this._lastDayReset = todayStart;
      }
      
      this._lastDayColorChanges++;
      
      // Trigger the flow with all required tokens
      await this.homey.flow
        .getDeviceTrigger('system_color_changed')
        .trigger(this, {
          old_color: oldColor,
          new_color: newColor,
          color_frequency_today: this._lastDayColorChanges.toString(),
          severity_change: this.calculateSeverityChange(oldColor, newColor),
          expected_duration: this.calculateExpectedDuration(this.currentHourData)
        });
    } catch (error) {
      this.error('Failed to trigger color change flow:', error);
    }
  }

  calculateExpectedDuration(currentHourData) {
    // Implementation for expected duration calculation
    return 180; // Default to 3 hours for now
  }

  calculateSeverityChange(previousColor, newColor) {
    const severityMap = { green: 0, orange: 1, red: 2 };
    const prevSeverity = severityMap[previousColor] || 0;
    const newSeverity = severityMap[newColor] || 0;
    
    if (newSeverity > prevSeverity) return 'worsened';
    if (newSeverity < prevSeverity) return 'improved';
    return 'unchanged';
  }

  calculateSeverityLevel(previousColor, newColor) {
    const severityMap = { green: 0, orange: 1, red: 2 };
    const prevSeverity = severityMap[previousColor] || 0;
    const newSeverity = severityMap[newColor] || 0;
    return newSeverity - prevSeverity;
  }

  calculateMarginChange(currentHourData) {
    // Implementation for margin change calculation
    return 0; // Placeholder
  }

  /**
   * Format duration into human readable string
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} - Formatted duration string
   */
  _formatDuration(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours === 0) {
      return `${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  }

  /**
   * Calculate previous color duration
   * @returns {string} - Formatted duration or "5h+" if history is limited
   */
  _calculatePreviousDuration() {
    const colorStartTime = this.getStoreValue('color_start_time');
    if (!colorStartTime) {
      return '5h+'; // Indicate limited history
    }
    
    const duration = Date.now() - colorStartTime;
    return this._formatDuration(duration);
  }

  /**
   * Determine the type of color change
   * @param {string} previousColor - Previous system color
   * @param {string} newColor - New system color
   * @returns {string} - Change type description
   */
  _getChangeType(previousColor, newColor) {
    const severityMap = { green: 0, orange: 1, red: 2 };
    const prevSeverity = severityMap[previousColor] || 0;
    const newSeverity = severityMap[newColor] || 0;
    
    if (newSeverity > prevSeverity) return 'worsening';
    if (newSeverity < prevSeverity) return 'improving';
    return 'neutral';
  }

  /**
   * Analyze forecast stability for a color
   * @param {string} color - The color to analyze
   * @param {Array} forecast - Forecast data
   * @returns {string} - Stability assessment
   */
  _analyzeForcastStability(color, forecast) {
    // Get next 6 hours from forecast
    const nextHours = forecast.slice(0, 6);
    
    // Count matching colors
    const matchingColors = nextHours.filter(hour => 
      hour.Color.toLowerCase() === color.toLowerCase()
    ).length;
    
    if (matchingColors >= 5) return 'stable';
    if (matchingColors <= 2) return 'temporary';
    return 'uncertain';
  }

  /**
   * Find next forecast color change
   * @param {string} currentColor - Current system color
   * @param {Array} forecast - Forecast data
   * @returns {string} - Human readable forecast of next change
   */
  _findNextColorChange(currentColor, forecast) {
    for (let i = 0; i < forecast.length; i++) {
      if (forecast[i].Color.toLowerCase() !== currentColor.toLowerCase()) {
        if (i === 0) return 'immediate';
        if (i === 1) return 'in 1 hour';
        return `in ${i} hours`;
      }
    }
    return 'none in forecast';
  }

  /**
   * Calculate margin change metrics
   * @param {Object} currentStatus - Current hour status data
   * @returns {string} - Formatted margin change string
   */
  _calculateMarginChange(currentStatus) {
    const previousMargin = this.getStoreValue('previous_margin');
    const currentMargin = currentStatus.DeclaredAvailabilty - currentStatus.LoadForecast;
    
    if (!previousMargin) {
      this.setStoreValue('previous_margin', currentMargin);
      return 'N/A';
    }
    
    const change = currentMargin - previousMargin;
    const percentChange = ((change / previousMargin) * 100).toFixed(1);
    return `${percentChange}% (${change >= 0 ? '+' : ''}${change}MW)`;
  }

  /**
   * Calculate utilization change
   * @param {Object} currentStatus - Current hour status data
   * @returns {string} - Formatted utilization change string
   */
  _calculateUtilizationChange(currentStatus) {
    const previousUtilization = this.getStoreValue('previous_utilization');
    const currentUtilization = (currentStatus.LoadForecast / currentStatus.DeclaredAvailabilty) * 100;
    
    if (!previousUtilization) {
      this.setStoreValue('previous_utilization', currentUtilization);
      return 'N/A';
    }
    
    const change = (currentUtilization - previousUtilization).toFixed(1);
    return `${change >= 0 ? '+' : ''}${change}pp`;
  }

  /**
   * Get historical color changes for a time period
   * @param {Date} startDate - Start date for analysis
   * @param {Date} endDate - End date for analysis
   * @returns {Promise<Object>} - Historical color statistics
   */
  async _getColorHistory(startDate, endDate) {
    try {
      // Since we don't have insights access, we'll use the stored color changes
      return {
        counts: {},
        durations: {},
        totalEntries: this._lastDayColorChanges || 0
      };
    } catch (error) {
      this.error('Error getting color history:', error);
      return { counts: {}, durations: {}, totalEntries: 0 };
    }
  }

  /**
   * Get historical margin statistics
   * @param {Date} startDate - Start date for analysis
   * @param {Date} endDate - End date for analysis
   * @returns {Promise<Object>} - Margin statistics
   */
  async _getMarginStats(startDate, endDate) {
    try {
      const entries = await this.insightsMargin.getEntries({
        startDate,
        endDate
      });

      if (entries.length === 0) return null;

      const values = entries.map(entry => entry.value);
      const average = values.reduce((sum, val) => sum + val, 0) / values.length;
      const sorted = values.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      // Calculate standard deviation
      const squareDiffs = values.map(value => {
        const diff = value - average;
        return diff * diff;
      });
      const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
      const stdDev = Math.sqrt(avgSquareDiff);

      return {
        average,
        median,
        stdDev,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    } catch (error) {
      this.error('Error getting margin statistics:', error);
      return null;
    }
  }

  /**
   * Analyze time patterns for a specific color
   * @param {string} color - The color to analyze
   * @returns {Promise<Object>} - Time pattern analysis
   */
  async _analyzeTimePatterns(color) {
    try {
      // Get one week of history
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);

      const entries = await this.insightsSystemColor.getEntries({
        startDate,
        endDate
      });

      // Group by hour of day
      const hourlyPatterns = Array(24).fill(0).map(() => ({
        total: 0,
        colorCount: 0
      }));

      entries.forEach(entry => {
        const hour = new Date(entry.date).getHours();
        hourlyPatterns[hour].total++;
        if (entry.value === color) {
          hourlyPatterns[hour].colorCount++;
        }
      });

      // Calculate probability for each hour
      const hourlyProbability = hourlyPatterns.map((pattern, hour) => ({
        hour,
        probability: pattern.total > 0 ? 
          (pattern.colorCount / pattern.total) * 100 : 0
      }));

      // Find peak probability hours
      const peakHours = hourlyProbability
        .filter(h => h.probability > 50)
        .map(h => h.hour);

      return {
        hourlyProbability,
        peakHours,
        isTypicalTime: hourlyProbability[new Date().getHours()].probability > 30
      };
    } catch (error) {
      this.error('Error analyzing time patterns:', error);
      return {
        hourlyProbability: [],
        peakHours: [],
        isTypicalTime: false
      };
    }
  }

  /**
   * Calculate historical recovery patterns
   * @param {string} fromColor - Starting color
   * @param {string} toColor - Target color (usually 'green')
   * @returns {Promise<Object>} - Recovery pattern analysis
   */
  async _analyzeRecoveryPatterns(fromColor, toColor = 'green') {
    try {
      // Get two weeks of history
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 14);

      const entries = await this.insightsSystemColor.getEntries({
        startDate,
        endDate
      });

      let recoveryTimes = [];
      let startTime = null;

      // Find color change sequences
      entries.forEach(entry => {
        if (entry.value === fromColor && !startTime) {
          startTime = new Date(entry.date);
        } else if (entry.value === toColor && startTime) {
          const recoveryTime = new Date(entry.date) - startTime;
          recoveryTimes.push(recoveryTime / (1000 * 60)); // Convert to minutes
          startTime = null;
        }
      });

      if (recoveryTimes.length === 0) {
        return {
          averageRecovery: null,
          medianRecovery: null,
          typicalRange: null,
          sampleSize: 0
        };
      }

      // Calculate statistics
      const average = recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length;
      const sorted = recoveryTimes.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const range = {
        min: sorted[0],
        max: sorted[sorted.length - 1]
      };

      return {
        averageRecovery: Math.round(average),
        medianRecovery: Math.round(median),
        typicalRange: range,
        sampleSize: recoveryTimes.length
      };
    } catch (error) {
      this.error('Error analyzing recovery patterns:', error);
      return {
        averageRecovery: null,
        medianRecovery: null,
        typicalRange: null,
        sampleSize: 0
      };
    }
  }

  /**
   * Get ordinal suffix for a number
   * @param {number} n - The number
   * @returns {string} - Number with ordinal suffix
   */
  _getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
}

module.exports = PowerStatusDevice; 