'use strict';

const Homey = require('homey');
const path = require('path');
const fs = require('fs').promises;

class PowerAlertApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('PowerAlert app has been initialized');

    // Initialize export directory
    await this.initializeExportDirectory();

    // Register API endpoint for file downloads
    await this.registerExportEndpoint();
  }

  /**
   * Initialize the export directory
   */
  async initializeExportDirectory() {
    try {
      this.exportPath = path.join(this.homey.userDataPath, 'exports');
      await fs.mkdir(this.exportPath, { recursive: true });
      this.log('Export directory initialized:', this.exportPath);
    } catch (error) {
      this.error('Failed to initialize export directory:', error);
      throw error;
    }
  }

  /**
   * Register API endpoint for file downloads
   */
  async registerExportEndpoint() {
    this.homey.api.registerGetHandler('/exports/:filename', async (args) => {
      try {
        const filePath = path.join(this.exportPath, args.params.filename);
        const fileContent = await fs.readFile(filePath);
        return fileContent;
      } catch (error) {
        this.error('Failed to read export file:', error);
        throw new Error('File not found');
      }
    });
  }

  /**
   * Clean up old export files (keep last 10)
   */
  async cleanupExportFiles() {
    try {
      const files = await fs.readdir(this.exportPath);
      if (files.length <= 10) return;

      // Sort files by creation time
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const stats = await fs.stat(path.join(this.exportPath, file));
          return { file, ctime: stats.ctime };
        })
      );

      // Sort by creation time (newest first)
      fileStats.sort((a, b) => b.ctime - a.ctime);

      // Delete all but the newest 10 files
      for (let i = 10; i < fileStats.length; i++) {
        await fs.unlink(path.join(this.exportPath, fileStats[i].file));
      }
    } catch (error) {
      this.error('Failed to cleanup export files:', error);
    }
  }
}

module.exports = PowerAlertApp; 