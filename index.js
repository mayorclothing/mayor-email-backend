const express = require('express');
const { config } = require('./config');
const webhookRoute = require('./webhookRoute');
const newsletterRoute = require('./newsletterRoute');

const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/webhooks', webhookRoute);
app.use('/newsletter', newsletterRoute);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Mayor email backend listening on port ${config.port}`);
});
