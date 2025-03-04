'use strict';

import Homey from 'homey';
import { EskomSePushAPI } from './lib/api';

class EskomSePushApp extends Homey.App {
  private api!: EskomSePushAPI;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('EskomSePush app has been initialized');

    // Initialize API with token from settings
    try {
      const token = this.homey.settings.get('apiToken');
      this.api = new EskomSePushAPI(this, token || '');
      
      // Check if token is set and valid
      if (token) {
        this.log('API token found, checking validity...');
        try {
          const allowance = await this.api.checkAllowance();
          this.log('API token is valid. Allowance:', allowance);
        } catch (error: any) {
          this.error('API token validation failed:', error.message);
          // We don't throw here to allow the app to continue running
        }
      } else {
        this.log('No API token set. Please configure in app settings.');
      }

      // Register settings listeners
      this.homey.settings.on('set', key => {
        if (key === 'apiToken') {
          const newToken = this.homey.settings.get('apiToken');
          this.log('API token updated');
          this.api.setToken(newToken);
        }
      });

    } catch (error: any) {
      this.error('Failed to initialize app:', error.message);
    }
  }

  /**
   * Get the API instance
   */
  getApi(): EskomSePushAPI {
    return this.api;
  }
}

module.exports = EskomSePushApp;
