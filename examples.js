/**
 * Example webhook alert payloads for testing the router
 */

const examples = {
  criticalDatabaseDown: {
    title: 'Critical: Database Connection Lost',
    message: 'Primary PostgreSQL instance at db-prod-01 is unreachable. All queries failing.',
    source: 'prometheus-alertmanager',
    code: 503,
    tags: ['database', 'critical', 'prod'],
    metadata: {
      host: 'db-prod-01.internal',
      port: 5432,
      attempts: 5,
      last_error: 'connection timeout after 30s',
      affected_services: ['api', 'web', 'worker']
    }
  },

  apiErrorRate: {
    title: 'High: API Error Rate Spike',
    message: '5xx error rate increased to 25% (threshold: 5%)',
    source: 'datadog-monitor',
    code: 500,
    tags: ['api', 'performance', 'high'],
    metadata: {
      error_rate_percent: 25,
      threshold_percent: 5,
      affected_endpoint: '/api/v1/orders',
      error_types: ['500 Internal Server Error', '502 Bad Gateway']
    }
  },

  memoryWarning: {
    title: 'Warning: High Memory Usage',
    message: 'Node memory usage at 78% of allocated capacity',
    source: 'custom-monitoring',
    tags: ['performance', 'warning', 'ops'],
    metadata: {
      memory_percent: 78,
      memory_mb: 3120,
      threshold_percent: 80,
      host: 'app-server-03'
    }
  },

  deploymentNotice: {
    title: 'Notice: Deployment Completed',
    message: 'Successfully deployed version 2.5.1 to production',
    source: 'gitlab-ci',
    tags: ['deployment', 'info'],
    metadata: {
      version: '2.5.1',
      environment: 'production',
      duration_seconds: 240,
      status: 'success'
    }
  },

  healthCheck: {
    title: 'Info: Health Check Passed',
    message: 'All services responding normally',
    source: 'health-monitor',
    tags: ['health', 'info'],
    metadata: {
      timestamp: new Date().toISOString(),
      services_checked: 12,
      services_healthy: 12
    }
  },

  securityBreach: {
    title: 'Critical: Unauthorized API Access Detected',
    message: 'Multiple failed authentication attempts from unusual IP range',
    source: 'security-monitoring',
    code: 401,
    tags: ['security', 'critical', 'threat'],
    metadata: {
      source_ips: ['192.168.100.1', '192.168.100.2', '192.168.100.3'],
      attempts: 143,
      time_window: '5 minutes',
      geoip: 'China'
    }
  },

  sendExample: async function(exampleName) {
    const axios = require('axios');
    const alert = this[exampleName];
    
    if (!alert) {
      console.error(`Example '${exampleName}' not found`);
      return;
    }

    try {
      const response = await axios.post('http://localhost:3000/webhook', alert);
      console.log(`✓ Sent ${exampleName}:`, response.data);
    } catch (error) {
      console.error(`✗ Failed to send ${exampleName}:`, error.response?.data || error.message);
    }
  }
};

// CLI usage
if (require.main === module) {
  const exampleName = process.argv[2];
  
  if (!exampleName) {
    console.log('Available examples:');
    Object.keys(examples).filter(k => k !== 'sendExample').forEach(name => {
      console.log(`  - ${name}`);
    });
    console.log('\nUsage: node examples.js <example-name>');
    process.exit(0);
  }

  examples.sendExample(exampleName).then(() => {
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = examples;
