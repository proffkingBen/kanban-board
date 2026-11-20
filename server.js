const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const statuses = ['todo','in-progress','done'];
const priorities = ['low','medium','high'];
app.use(express.json());
app.use