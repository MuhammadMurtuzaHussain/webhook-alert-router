# Webhook Alert Router

Route incoming webhook alerts to Slack or email with intelligent severity-based triage logic. Reduce noise by routing critical issues to both channels, warnings to Slack only, and informational alerts to email.

## Features

- **Severity Classification**: Automatically classifies alerts as critical, high, medium, low, or info
- **Intelligent Routing**: Routes alerts based on severity
  - **Critical**: Slack + Email
  - **High**: Slack + Email
  - **Medium**: Slack only
  - **Low**: Email only
  - **Info**: Suppressed (no routing)
- **Deduplication**: Suppresses duplicate alerts within configurable time window (1 min default)
- **Email Support**: Sends formatted HTML emails via SMTP
- **Slack Integration**: Rich formatted messages with colour-coded severity
- **Health Check**: Built-in `/health` endpoint for monitoring
- **Structured Logging**: Configurable log levels with timestamps

## Quick Start

### Installation

```bash
git clone https://github.com/yourusername/webhook-alert-router.git
cd webhook-alert-router
npm install
cp .env.example .env
# Edit .env with your Slack and email config
npm start
```

### Send an Alert

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Database Connection Failed",
    "message": "Cannot reach primary database",
    "source": "monitoring-system",
    "tags": ["critical", "database"],
    "metadata": {"host": "db.example.com", "code": 500}
  }'
```

## Severity Classification

Alerts are classified based on keywords and HTTP status codes:

| Severity | Keywords | HTTP Codes | Routes |
|----------|----------|-----------|--------|
| **Critical** | critical, down, failure, panic, fatal, emergency | 5xx | Slack + Email |
| **High** | error, alert, severe, major, crash, outage | 4xx | Slack + Email |
| **Medium** | warning, warn, issue, problem | Any | Slack |
| **Low** | notice, info, debug | Any | Email |
| **Info** | (no matches) | - | None |

## Configuration

Environment variables in `.env`:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
EMAIL_FROM=alerts@yourdomain.com
EMAIL_TO=ops@yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=app-specific-password
PORT=3000
LOG_LEVEL=info
```

## API Endpoints

**POST /webhook** - Route an incoming alert

Request body:
```json
{
  "title": "Alert Title",
  "message": "Detailed message",
  "source": "alert-source",
  "code": 500,
  "tags": ["tag1", "tag2"],
  "metadata": {}
}
```

Response (success):
```json
{
  "success": true,
  "severity": "critical",
  "routes": ["slack", "email"],
  "results": {"slack": true, "email": true}
}
```

**GET /health** - Health check

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

## Programmatic Usage

```javascript
const { AlertRouter } = require('./webhook-alert-router');

const router = new AlertRouter({
  slackWebhookUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
  emailFrom: 'alerts@example.com',
  emailTo: 'ops@example.com',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  smtpUser: 'your-email@gmail.com',
  smtpPassword: 'app-password'
});

const result = await router.routeAlert({
  title: 'Service Down',
  message: 'API service unreachable',
  source: 'monitoring'
});

console.log(result);
```

## Docker

```bash
docker build -t webhook-alert-router .
docker run -p 3000:3000 --env-file .env webhook-alert-router
```

## Development

```bash
npm run dev      # Auto-reload with nodemon
npm test         # Run tests
npm run lint     # Lint code
```

## Integrations

### Prometheus Alertmanager

```yaml
route:
  receiver: 'webhook-alert-router'

receivers:
  - name: 'webhook-alert-router'
    webhook_configs:
      - url: 'http://your-server:3000/webhook'
```

### Custom Monitoring

```javascript
const axios = require('axios');

async function sendAlert(title, message) {
  await axios.post('http://localhost:3000/webhook', {
    title,
    message,
    source: 'custom-monitor'
  });
}
```

## Security

- Never commit `.env` files
- Use app-specific passwords for email
- Enable HTTPS in production
- Use credential management (AWS Secrets, Vault, etc.)
- Consider webhook signature verification

## Troubleshooting

**Emails not sending**
- Check SMTP credentials
- Verify firewall allows SMTP port (587 or 465)
- For Gmail, use app-specific passwords
- Check logs: `LOG_LEVEL=debug`

**Slack not working**
- Verify webhook URL is correct
- Check Slack app permissions
- Confirm URL format: `https://hooks.slack.com/services/...`

**Alerts being suppressed**
- Deduplication window is 1 minute by default
- Change source or metadata to create unique alerts

## License

MIT

## Contributing

Pull requests welcome. Ensure tests pass and code is linted before submitting.
