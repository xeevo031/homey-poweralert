'use strict';

const { Driver } = require('homey');

class PowerStatusDriver extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('PowerStatus driver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      {
        name: 'PowerAlert Status',
        data: {
          id: 'poweralert-status-1'
        }
      }
    ];
  }

}

module.exports = PowerStatusDriver; 