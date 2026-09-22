/**
 * Webhook Alert Router
 * Routes incoming webhook alerts to Slack or email based on severity triage logic
 * 
 * Environment Variables Required:
 * - SLACK_WEBHOOK_URL (optional): Slack incoming webhook URL
 * - EMAIL_FROM: Sender email address
 * - EMAIL_TO: Recipient email address(es)
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP port (default: 587)
 * - SMTP_USER: SMTP username
 * - SMTP_PASSWORD: SMTP password
 * - LOG_LEVEL: debug, info, warn, error (default: info)
 */

const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const crypto = require('crypto');

class AlertRouter {
  constructor(config = {}) {
    this.config = {
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || config.slackWebhookUrl,
      emailConfig: {
        from: process.env.EMAIL_FROM || config.emailFrom,
        to: process.env.EMAIL_TO || config.emailTo,
        host: process.env.SMTP_HOST || config.smtpHost,
        port: parseInt(process.env.SMTP_PORT || config.smtpPort || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || config.smtpUser,
          pass: process.env.SMTP_PASSWORD || config.smtpPassword,
        },
      },
      logLevel: process.env.LOG_LEVEL || 'info',
    };

    this.severityLevels = {
      critical: { priority: 1, routes: ['slack', 'email'], slackColor: '#FF0000' },
      high: { priority: 2, routes: ['slack', 'email'], slackColor: '#FF6600' },
      medium: { priority: 3, routes: ['slack'], slackColor: '#FFAA00' },
      low: { priority: 4, routes: ['email'], slackColor: '#00AA00' },
      info: { priority: 5, routes: [], slackColor: '#0099FF' },
    };

    this.mailer = nodemailer.createTransport(this.config.emailConfig);
    this.alertHistory = new Map();
    this.deduplicationWindow = 60000; // 1 minute
  }

  /**
   * Determine alert severity based on keywords and patterns
   */
  classifySeverity(alert) {
    const { title = '', message = '', code = '' } = alert;
    const content = `${title} ${message}`.toLowerCase();

    const criticalPatterns = /critical|down|failure|panic|fatal|emergency/;
    const highPatterns = /error|alert|severe|major|crash|outage/;
    const mediumPatterns = /warning|warn|issue|problem/;
    const lowPatterns = /notice|info|debug/;

    if (criticalPatterns.test(content) || code >= 500) return 'critical';
    if (highPatterns.test(content) || (code >= 400 && code < 500)) return 'high';
    if (mediumPatterns.test(content)) return 'medium';
    if (lowPatterns.test(content)) return 'low';

    return 'info';
  }

  /**
   * Generate unique fingerprint for deduplication
   */
  generateFingerprint(alert) {
    const content = JSON.stringify({
      source: alert.source,
      title: alert.title,
      severity: this.classifySeverity(alert),
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if alert is duplicate within deduplication window
   */
  isDuplicate(fingerprint) {
    if (this.alertHistory.has(fingerprint)) {
      const lastOccurrence = this.alertHistory.get(fingerprint);
      if (Date.now() - lastOccurrence < this.deduplicationWindow) {
        return true;
      }
    }
    this.alertHistory.set(fingerprint, Date.now());
    return false;
  }

  /**
   * Format alert for Slack
   */
  formatSlackMessage(alert, severity) {
    const severityConfig = this.severityLevels[severity];
    
    return {
      attachments: [
        {
          color: severityConfig.slackColor,
          title: `[${severity.toUpperCase()}] ${alert.title || 'Alert'}`,
          text: alert.message || 'No additional details',
          fields: [
            {
              title: 'Source',
              value: alert.source || 'Unknown',
              short: true,
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true,
            },
            ...(alert.tags ? [{
              title: 'Tags',
              value: Array.isArray(alert.tags) ? alert.tags.join(', ') : alert.tags,
              short: false,
            }] : []),
            ...(alert.metadata ? [{
              title: 'Metadata',
              value: JSON.stringify(alert.metadata, null, 2),
              short: false,
            }] : []),
          ],
          footer: 'Alert Router',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  /**
   * Format alert for email
   */
  formatEmailMessage(alert, severity) {
    const severityConfig = this.severityLevels[severity];
    const timestamp = new Date().toISOString();

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2 style="color: ${severityConfig.slackColor};">
            [${severity.toUpperCase()}] ${alert.title || 'Alert'}
          </h2>
          <p><strong>Timestamp:</strong> ${timestamp}</p>
          <p><strong>Source:</strong> ${alert.source || 'Unknown'}</p>
          
          <div style="background-color: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px;">
            <p><strong>Message:</strong></p>
            <p>${alert.message || 'No additional details'}</p>
          </div>

          ${alert.tags ? `
            <p><strong>Tags:</strong> ${Array.isArray(alert.tags) ? alert.tags.join(', ') : alert.tags}</p>
          ` : ''}

          ${alert.metadata ? `
            <p><strong>Metadata:</strong></p>
            <pre style="background-color: #f5f5f5; padding: 10px; overflow-x: auto;">
${JSON.stringify(alert.metadata, null, 2)}
            </pre>
          ` : ''}

          <hr />
          <small>This alert was automatically routed based on severity classification.</small>
        </body>
      </html>
    `;

    return {
      from: this.config.emailConfig.from,
      to: this.config.emailConfig.to,
      subject: `[${severity.toUpperCase()}] ${alert.title || 'Alert'}`,
      html,
    };
  }

  /**
   * Send alert to Slack
   */
  async sendToSlack(alert, severity) {
    if (!this.config.slackWebhookUrl) {
      this.log('warn', 'Slack webhook URL not configured, skipping Slack notification');
      return false;
    }

    try {
      const message = this.formatSlackMessage(alert, severity);
      await axios.post(this.config.slackWebhookUrl, message);
      this.log('info', `Alert sent to Slack (severity: ${severity})`);
      return true;
    } catch (error) {
      this.log('error', `Failed to send to Slack: ${error.message}`);
      return false;
    }
  }

  /**
   * Send alert via email
   */
  async sendViaEmail(alert, severity) {
    if (!this.config.emailConfig.from || !this.config.emailConfig.to) {
      this.log('warn', 'Email configuration incomplete, skipping email notification');
      return false;
    }

    try {
      const mailOptions = this.formatEmailMessage(alert, severity);
      await this.mailer.sendMail(mailOptions);
      this.log('info', `Alert sent via email (severity: ${severity})`);
      return true;
    } catch (error) {
      this.log('error', `Failed to send email: ${error.message}`);
      return false;
    }
  }

  /**
   * Route alert based on severity
   */
  async routeAlert(alert) {
    // Validate alert structure
    if (!alert || typeof alert !== 'object') {
      this.log('error', 'Invalid alert format');
      throw new Error('Alert must be an object');
    }

    // Classify severity
    const severity = this.classifySeverity(alert);
    this.log('info', `Alert classified as: ${severity}`);

    // Check for duplicates
    const fingerprint = this.generateFingerprint(alert);
    if (this.isDuplicate(fingerprint)) {
      this.log('warn', 'Duplicate alert suppressed within deduplication window');
      return { success: false, reason: 'duplicate' };
    }

    // Get routing configuration for this severity
    const severityConfig = this.severityLevels[severity];
    const routes = severityConfig.routes;

    this.log('info', `Routing to: ${routes.join(', ') || 'none (info level)'}`);

    // Send to configured channels
    const results = {};
    if (routes.includes('slack')) {
      results.slack = await this.sendToSlack(alert, severity);
    }
    if (routes.includes('email')) {
      results.email = await this.sendViaEmail(alert, severity);
    }

    return {
      success: true,
      severity,
      routes,
      results,
    };
  }

  /**
   * Simple logging utility
   */
  log(level, message) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logLevel] || 1;

    if (levels[level] >= configLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Express middleware for handling POST requests
   */
  middleware() {
    return express.json();
  }

  /**
   * Express route handler
   */
  handler() {
    return async (req, res) => {
      try {
        const result = await this.routeAlert(req.body);
        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        this.log('error', `Request handler error: ${error.message}`);
        res.status(400).json({ error: error.message });
      }
    };
  }
}

// Express server setup
function createServer(alertRouter) {
  const app = express();
  
  app.use(alertRouter.middleware());
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Alert routing endpoint
  app.post('/webhook', alertRouter.handler());

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    alertRouter.log('error', `Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// Standalone usage
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const alertRouter = new AlertRouter();
  const app = createServer(alertRouter);

  app.listen(PORT, () => {
    alertRouter.log('info', `Alert Router listening on port ${PORT}`);
    alertRouter.log('info', `POST /webhook - Route alerts`);
    alertRouter.log('info', `GET /health - Health check`);
  });
}

module.exports = { AlertRouter, createServer };
