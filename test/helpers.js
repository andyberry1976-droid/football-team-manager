'use strict';

const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

function memoryDb() {
  return openDb(':memory:');
}

async function startApp(db) {
  const app = createApp({ db: db || memoryDb() });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return { app, server, base, close, db: app.locals.db };
}

async function request(base, method, path, form) {
  const options = { method, redirect: 'manual' };
  if (form) {
    options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    options.body = new URLSearchParams(form).toString();
  }
  const res = await fetch(base + path, options);
  const body = await res.text();
  return {
    status: res.status,
    body,
    location: res.headers.get('location'),
  };
}

function get(base, path) {
  return request(base, 'GET', path);
}

function post(base, path, form) {
  return request(base, 'POST', path, form);
}

module.exports = { memoryDb, startApp, request, get, post };
