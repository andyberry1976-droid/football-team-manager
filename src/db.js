'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  short_name TEXT,
  colour TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  squad_number INTEGER NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (team_id, squad_number)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  kickoff TEXT NOT NULL,
  venue TEXT,
  played INTEGER NOT NULL DEFAULT 0,
  home_goals INTEGER,
  away_goals INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (home_team_id != away_team_id),
  CHECK (home_goals IS NULL OR home_goals >= 0),
  CHECK (away_goals IS NULL OR away_goals >= 0)
);
`;

function defaultDbPath() {
  return process.env.DB_FILE || path.join(process.cwd(), 'data', 'app.db');
}

function openDb(dbPath = defaultDbPath()) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb, defaultDbPath };
