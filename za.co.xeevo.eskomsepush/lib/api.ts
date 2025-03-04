'use strict';

import Homey from 'homey';
import fetch from 'node-fetch';

export class EskomSePushAPI {
  private token: string;
  private baseUrl: string = 'https://developer.sepush.co.za/business/2.0';
  private homey: Homey.App;
  private timeout: number = 10000; // 10 seconds timeout

  constructor(homey: Homey.App, token: string) {
    this.homey = homey;
    this.token = token;
  }

  /**
   * Set the API token
   */
  setToken(token: string) {
    this.token = token;
  }

  /**
   * Get the current API token
   */
  getToken(): string {
    return this.token;
  }

  /**
   * Make a request to the EskomSePush API
   */
  private async makeRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    if (!this.token) {
      this.homey.log('API token not set');
      throw new Error('API token not set');
    }

    // Build URL with query parameters
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });

    this.homey.log(`Making API request to: ${endpoint}`);
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), this.timeout);
      });
      
      // Make the request with proper headers
      const fetchPromise = fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Token': this.token
        }
      });
      
      // Race the fetch against the timeout
      const response: Response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      this.homey.log(`API response status: ${response.status}`);
      
      // Handle different HTTP status codes
      switch (response.status) {
        case 200:
          const data = await response.json();
          this.homey.log(`API request successful: ${endpoint}`);
          return data;
        case 400:
          throw new Error('Bad Request: The request was invalid');
        case 403:
          throw new Error('Not Authenticated: Token Invalid or Disabled');
        case 404:
          throw new Error('Not Found: The requested resource was not found');
        case 408:
          throw new Error('Request Timeout: Please try again later');
        case 429:
          throw new Error('Too Many Requests: Token quota exceeded');
        default:
          if (response.status >= 500) {
            throw new Error(`Server Error: ${response.status}`);
          }
          throw new Error(`Unknown Error: ${response.status}`);
      }
    } catch (error: any) {
      this.homey.error(`API Request Error for ${endpoint}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the current and next loadshedding statuses for South Africa
   */
  async getStatus(): Promise<any> {
    try {
      return await this.makeRequest('/status');
    } catch (error: any) {
      this.homey.error('Error getting status:', error.message);
      throw error;
    }
  }

  /**
   * Get information about a specific area
   */
  async getAreaInfo(id: string, test?: string): Promise<any> {
    try {
      const params: Record<string, string> = { id };
      if (test) {
        params.test = test;
      }
      return await this.makeRequest('/area', params);
    } catch (error: any) {
      this.homey.error('Error getting area info:', error.message);
      throw error;
    }
  }

  /**
   * Search for areas based on text
   */
  async searchAreas(text: string): Promise<any> {
    try {
      return await this.makeRequest('/areas_search', { text });
    } catch (error: any) {
      this.homey.error('Error searching areas:', error.message);
      throw error;
    }
  }

  /**
   * Find areas based on GPS coordinates
   */
  async findAreasNearby(lat: string, lon: string): Promise<any> {
    try {
      return await this.makeRequest('/areas_nearby', { lat, lon });
    } catch (error: any) {
      this.homey.error('Error finding areas nearby:', error.message);
      throw error;
    }
  }

  /**
   * Check the API allowance for the token
   */
  async checkAllowance(): Promise<any> {
    try {
      return await this.makeRequest('/api_allowance');
    } catch (error: any) {
      this.homey.error('Error checking allowance:', error.message);
      throw error;
    }
  }
}