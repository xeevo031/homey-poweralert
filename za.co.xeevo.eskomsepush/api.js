module.exports = {
  async checkApi({ homey }) {
    try {
      homey.app.log('API checkApi called');
      
      const app = homey.app;
      if (!app) {
        homey.error('App instance not available');
        return {
          success: false,
          message: 'App instance not available'
        };
      }
      
      try {
        const api = app.getApi();
        
        if (!api) {
          homey.app.log('API instance not available');
          return {
            success: false,
            message: 'API instance not available'
          };
        }
        
        // Get token from settings using ManagerSettings
        const token = homey.settings.get('apiToken');
        
        if (!token) {
          homey.app.log('API token not set in settings');
          return {
            success: false,
            message: 'API token not set'
          };
        }
        
        homey.app.log('Checking API allowance');
        const allowance = await api.checkAllowance();
        homey.app.log('API allowance checked successfully', allowance);
        
        // Emit a realtime event to notify clients about successful API check
        try {
          if (homey.api && typeof homey.api.realtime === 'function') {
            homey.app.log('Emitting realtime event: api_check_success');
            homey.api.realtime('api_check_success', { allowance: allowance.allowance });
          } else {
            homey.app.log('homey.api.realtime is not available');
          }
        } catch (realtimeError) {
          homey.app.error('Error emitting realtime event:', realtimeError);
        }
        
        return {
          success: true,
          allowance: allowance.allowance
        };
      } catch (innerError) {
        homey.app.error('Error in API check:', innerError.message);
        
        // Emit a realtime event to notify clients about API check failure
        try {
          if (homey.api && typeof homey.api.realtime === 'function') {
            homey.app.log('Emitting realtime event: api_check_error');
            homey.api.realtime('api_check_error', { error: innerError.message });
          } else {
            homey.app.log('homey.api.realtime is not available');
          }
        } catch (realtimeError) {
          homey.app.error('Error emitting realtime event:', realtimeError);
        }
        
        return {
          success: false,
          message: innerError.message || 'Unknown error occurred'
        };
      }
    } catch (error) {
      homey.error('Unexpected error in checkApi:', error);
      return {
        success: false,
        message: error.message || 'Unexpected error occurred'
      };
    }
  },

  /**
   * Debug API endpoint that returns information about the app
   * Endpoint: GET /debug-api
   */
  async debugApi({ homey }) {
    try {
      homey.app.log('API debugApi called');
      
      const app = homey.app;
      if (!app) {
        homey.error('App instance not available');
        return {
          success: false,
          message: 'App instance not available'
        };
      }
      
      // Get token from settings using ManagerSettings
      const token = homey.settings.get('apiToken');
      
      // Get all settings keys for debugging
      const settingsKeys = homey.settings.getKeys();
      
      // Collect debug information
      const debugInfo = {
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        tokenPrefix: token ? token.substring(0, 4) + '...' : 'N/A',
        settingsKeys: settingsKeys,
        apiInstance: !!app.getApi(),
        appVersion: homey.manifest.version,
        homeyVersion: homey.version,
        homeyPlatform: homey.platform,
        homeyPlatformVersion: homey.platformVersion
      };
      
      homey.app.log('Debug info collected:', debugInfo);
      
      return {
        success: true,
        debug: debugInfo
      };
    } catch (error) {
      homey.error('Error in debugApi:', error);
      return {
        success: false,
        message: error.message || 'Error collecting debug information'
      };
    }
  },
  
  /**
   * Validate an API token with EskomSePush
   * Endpoint: POST /validate-token
   */
  async validateToken({ homey, body }) {
    try {
      homey.app.log('API validateToken called');
      
      if (!body || !body.token) {
        homey.app.log('No token provided in request body');
        return {
          success: false,
          message: 'No token provided in request body'
        };
      }
      
      const token = body.token;
      homey.app.log('Validating token:', token.substring(0, 4) + '...');
      
      // Validate the token
      const validationResult = await _validateTokenInternal(homey, token);
      
      if (validationResult.success && validationResult.isValidToken) {
        homey.app.log('Token is valid, saving to settings');
        
        // Save the token to settings if it's valid
        homey.settings.set('apiToken', token);
        
        // Emit a realtime event to notify clients about token update
        try {
          if (homey.api && typeof homey.api.realtime === 'function') {
            homey.app.log('Emitting realtime event: token_updated');
            homey.api.realtime('token_updated', { success: true });
          } else {
            homey.app.log('homey.api.realtime is not available');
          }
        } catch (realtimeError) {
          homey.app.error('Error emitting realtime event:', realtimeError);
        }
      }
      
      return validationResult;
    } catch (error) {
      homey.error('Error in validateToken:', error);
      return {
        success: false,
        message: error.message || 'Error validating token'
      };
    }
  },
  
  /**
   * Validate an API token without saving it
   * Endpoint: POST /validate-token-only
   */
  async validateTokenOnly({ homey, body }) {
    try {
      homey.app.log('API validateTokenOnly called');
      
      if (!body || !body.token) {
        homey.app.log('No token provided in request body');
        return {
          success: false,
          message: 'No token provided in request body'
        };
      }
      
      const token = body.token;
      homey.app.log('Validating token only (no save):', token.substring(0, 4) + '...');
      
      // Validate the token without saving
      const validationResult = await _validateTokenInternal(homey, token);
      
      return validationResult;
    } catch (error) {
      homey.error('Error in validateTokenOnly:', error);
      return {
        success: false,
        message: error.message || 'Error validating token'
      };
    }
  }
};

/**
 * Internal function to validate a token with the EskomSePush API
 * Simplified to rely on HTTP status codes for validation
 */
async function _validateTokenInternal(homey, token) {
  const app = homey.app;
  if (!app) {
    homey.error('App instance not available in _validateTokenInternal');
    return {
      success: false,
      isValidToken: false,
      message: 'App instance not available',
      statusCode: 500,
      statusText: 'Internal Server Error - App instance not available',
      rawResponse: ''
    };
  }
  
  app.log('Validating token internally:', token ? token.substring(0, 4) + '...' : 'undefined');
  
  // Basic validation of token format
  if (!token) {
    app.log('No token provided');
    return {
      success: false, 
      isValidToken: false,
      message: 'No token provided',
      statusCode: 400,
      statusText: 'Bad Request - No token provided',
      rawResponse: ''
    };
  }
  
  if (token.length < 8) {
    app.log('Token is too short');
    return {
      success: false,
      isValidToken: false,
      message: 'Token is too short',
      statusCode: 400,
      statusText: 'Bad Request - Token is too short',
      rawResponse: ''
    };
  }
  
  try {
    // Make a direct validation request to EskomSePush API
    app.log('Making direct validation request to EskomSePush API...');
    
    // Use the allowance endpoint to check if the token is valid
    const apiUrl = 'https://developer.sepush.co.za/business/2.0/api_allowance';
    app.log(`Sending request to ${apiUrl}`);
    
    // Use the built-in https module for maximum compatibility
    const https = require('https');
    const url = require('url');
    
    // Create a promise-based request with timeout
    const result = await new Promise((resolve) => {
      // Default response in case of errors
      let response = {
        success: false,
        isValidToken: false,
        message: 'Network error or timeout',
        statusCode: 503,
        statusText: 'Service Unavailable',
        rawResponse: ''
      };
      
      try {
        const parsedUrl = url.parse(apiUrl);
        
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'Token': token
          },
          timeout: 15000 // 15 second timeout
        };
        
        app.log('Request options:', JSON.stringify(options));
        
        const req = https.request(options, (res) => {
          let data = '';
          
          // Get the status code
          const statusCode = res.statusCode;
          app.log(`API response status: ${statusCode}`);
          
          // Collect data
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          // Process when complete
          res.on('end', () => {
            app.log('Raw response text:', data);
            
            // Update the response object
            response.statusCode = statusCode;
            response.rawResponse = data;
            
            // Try to parse as JSON
            let parsedResponse = null;
            if (data && data.trim().startsWith('{')) {
              try {
                parsedResponse = JSON.parse(data);
                app.log('Parsed response:', JSON.stringify(parsedResponse));
                
                // Add allowance info if available
                if (parsedResponse.allowance) {
                  response.allowance = parsedResponse.allowance;
                }
              } catch (e) {
                app.error('Error parsing JSON response:', e);
              }
            }
            
            // Process based on status code
            if (statusCode === 200) {
              // Success - token is valid
              response.success = true;
              response.isValidToken = true;
              response.message = 'Token is valid';
              response.statusText = 'OK - Token is valid';
              
              // Check if quota is exceeded
              if (parsedResponse && parsedResponse.allowance && 
                  parsedResponse.allowance.count > parsedResponse.allowance.limit) {
                response.quotaExceeded = true;
                response.message = 'Token valid but quota exceeded';
                response.statusText = 'OK - Token valid but quota exceeded';
              }
            } else if (statusCode === 401 || statusCode === 403) {
              // Authentication failure - invalid token
              response.message = 'Authentication failed - Invalid token';
              response.statusText = 'Unauthorized - Invalid token';
            } else if (statusCode === 429) {
              // Rate limited but token is valid
              response.success = true;
              response.isValidToken = true;
              response.quotaExceeded = true;
              response.message = 'Too many requests - Token quota exceeded';
              response.statusText = 'Too Many Requests - Token quota exceeded';
            } else if (statusCode === 400) {
              // Bad request
              response.message = 'Bad request - Invalid token format';
              response.statusText = 'Bad Request - Invalid token format';
            } else if (statusCode >= 500) {
              // Server error
              response.message = 'Server error - Please try again later';
              response.statusText = 'Server Error - Please try again later';
            } else {
              // Other status codes
              response.message = `Unexpected status code: ${statusCode}`;
              response.statusText = `Unexpected Status: ${statusCode}`;
            }
            
            resolve(response);
          });
        });
        
        // Handle errors
        req.on('error', (error) => {
          app.error('HTTP request error:', error);
          
          response.message = `Network error: ${error.message}`;
          response.statusText = 'Network Error';
          response.error = error.message;
          
          resolve(response);
        });
        
        // Handle timeout
        req.on('timeout', () => {
          app.error('Request timed out');
          req.destroy();
          
          response.message = 'Request timed out';
          response.statusText = 'Request Timeout';
          response.statusCode = 408;
          
          resolve(response);
        });
        
        // End the request
        req.end();
        
      } catch (error) {
        // Catch any synchronous errors
        app.error('Error setting up request:', error);
        
        response.message = `Error: ${error.message}`;
        response.error = error.message;
        
        resolve(response);
      }
    });
    
    app.log('Final validation result:', JSON.stringify(result));
    return result;
    
  } catch (error) {
    app.error('Unexpected error in _validateTokenInternal:', error);
    return {
      success: false,
      isValidToken: false,
      message: 'Error validating token: ' + (error.message || 'Unknown error'),
      statusCode: 500,
      statusText: 'Error - Could not validate token',
      rawResponse: error.toString()
    };
  }
}