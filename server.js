'use strict';

const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// ── Routes ────────────────────────────────────────────────────────────────────

// Root → serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'robotics-intelligence-platform.html'));
});

// Health / status check
app.get('/api/status', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
