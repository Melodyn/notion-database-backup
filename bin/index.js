#!/usr/bin/env node

import app from '../index.js';

app()
  .then(console.log)
  .catch(console.error);
