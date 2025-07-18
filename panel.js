// panel.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const CONFIG = path.join(__dirname, 'config.json');
let cfg = require(CONFIG);

module.exports = (client) => {
  const router = express.Router();

  // Middleware: nur Admins
  router.use((req, res, next) => {
    if (!req.isAuthenticated?.() || !req.user) return res.redirect('/login');
    next();
  });

  // Panel-Startseite
  router.get('/panel', (_req, res) =>
    res.render('panel', { cfg })
  );

  // usw. …

  return router;            // WICHTIG: nur Router zurückgeben
};
