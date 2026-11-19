'use strict';

const path = require('path');
const express = require('express');
const { openDb } = require('./db');
const {
  createStore,
  ValidationError,
  POSITIONS,
  POSITION_LABELS,
  formatKickoff,
} = require('./store');

function parseRouteId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function noticeRedirect(res, url, message) {
  const sep = url.includes('?') ? '&' : '?';
  return res.redirect(`${url}${sep}notice=${encodeURIComponent(message)}`);
}

function createApp(options = {}) {
  const db = options.db || openDb(options.dbPath);
  const store = createStore(db);

  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', false);

  app.locals.formatKickoff = formatKickoff;
  app.locals.POSITIONS = POSITIONS;
  app.locals.POSITION_LABELS = POSITION_LABELS;

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((req, res, next) => {
    res.locals.notice = typeof req.query.notice === 'string' ? req.query.notice : null;
    res.locals.currentPath = req.path;
    res.locals.errors = null;
    next();
  });

  function renderFormError(res, next, view, data, err) {
    if (err instanceof ValidationError) {
      return res.status(400).render(view, { ...data, errors: err.messages });
    }
    return next(err);
  }

  // Home
  app.get('/', (req, res) => {
    res.render('home', {
      title: 'Home',
      table: store.leagueTable(),
      upcoming: store.listUpcoming().slice(0, 6),
      recent: store.listResults().slice(0, 5),
      teamCount: store.listTeams().length,
    });
  });

  // Teams
  app.get('/teams', (req, res) => {
    res.render('teams/index', {
      title: 'Teams',
      teams: store.listTeams(),
    });
  });

  app.get('/teams/new', (req, res) => {
    res.render('teams/form', {
      title: 'Add team',
      team: { name: '', short_name: '', colour: '' },
      action: '/teams',
      heading: 'Add a team',
    });
  });

  app.post('/teams', (req, res, next) => {
    try {
      const team = store.createTeam(req.body);
      return noticeRedirect(res, `/teams/${team.id}`, 'Team saved.');
    } catch (err) {
      return renderFormError(res, next, 'teams/form', {
        title: 'Add team',
        team: req.body,
        action: '/teams',
        heading: 'Add a team',
      }, err);
    }
  });

  app.get('/teams/:id', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const team = id && store.getTeam(id);
    if (!team) return next();
    res.render('teams/show', {
      title: team.name,
      team,
      players: store.listPlayers(team.id),
      fixtures: store.fixturesForTeam(team.id),
    });
  });

  app.get('/teams/:id/edit', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const team = id && store.getTeam(id);
    if (!team) return next();
    res.render('teams/form', {
      title: `Edit ${team.name}`,
      team,
      action: `/teams/${team.id}`,
      heading: 'Edit team',
    });
  });

  app.post('/teams/:id', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    if (!id || !store.getTeam(id)) return next();
    try {
      store.updateTeam(id, req.body);
      return noticeRedirect(res, `/teams/${id}`, 'Team updated.');
    } catch (err) {
      return renderFormError(res, next, 'teams/form', {
        title: 'Edit team',
        team: { id, ...req.body },
        action: `/teams/${id}`,
        heading: 'Edit team',
      }, err);
    }
  });

  app.post('/teams/:id/delete', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    if (!id || !store.getTeam(id)) return next();
    try {
      store.deleteTeam(id);
      return noticeRedirect(res, '/teams', 'Team deleted.');
    } catch (err) {
      if (err instanceof ValidationError) {
        const team = store.getTeam(id);
        return res.status(400).render('teams/show', {
          title: team.name,
          team,
          players: store.listPlayers(team.id),
          fixtures: store.fixturesForTeam(team.id),
          errors: err.messages,
        });
      }
      return next(err);
    }
  });

  // Players
  app.get('/teams/:id/players/new', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const team = id && store.getTeam(id);
    if (!team) return next();
    res.render('players/form', {
      title: `Add player · ${team.name}`,
      team,
      player: { name: '', squad_number: '', position: 'MID' },
      action: `/teams/${team.id}/players`,
      heading: 'Add a player',
    });
  });

  app.post('/teams/:id/players', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const team = id && store.getTeam(id);
    if (!team) return next();
    try {
      store.createPlayer(team.id, req.body);
      return noticeRedirect(res, `/teams/${team.id}`, 'Player saved.');
    } catch (err) {
      return renderFormError(res, next, 'players/form', {
        title: `Add player · ${team.name}`,
        team,
        player: req.body,
        action: `/teams/${team.id}/players`,
        heading: 'Add a player',
      }, err);
    }
  });

  app.get('/players/:id/edit', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const player = id && store.getPlayer(id);
    if (!player) return next();
    const team = store.getTeam(player.team_id);
    res.render('players/form', {
      title: `Edit player · ${team.name}`,
      team,
      player,
      action: `/players/${player.id}`,
      heading: 'Edit player',
    });
  });

  app.post('/players/:id', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const player = id && store.getPlayer(id);
    if (!player) return next();
    const team = store.getTeam(player.team_id);
    try {
      store.updatePlayer(id, req.body);
      return noticeRedirect(res, `/teams/${team.id}`, 'Player updated.');
    } catch (err) {
      return renderFormError(res, next, 'players/form', {
        title: `Edit player · ${team.name}`,
        team,
        player: { id, ...req.body },
        action: `/players/${id}`,
        heading: 'Edit player',
      }, err);
    }
  });

  app.post('/players/:id/delete', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const player = id && store.getPlayer(id);
    if (!player) return next();
    const teamId = player.team_id;
    store.deletePlayer(id);
    return noticeRedirect(res, `/teams/${teamId}`, 'Player removed.');
  });

  // Fixtures
  app.get('/fixtures', (req, res) => {
    res.render('fixtures/index', {
      title: 'Fixtures',
      fixtures: store.listUpcoming(),
    });
  });

  app.get('/fixtures/new', (req, res) => {
    const teams = store.listTeams();
    res.render('fixtures/form', {
      title: 'Add fixture',
      fixture: { home_team_id: '', away_team_id: '', kickoff: '', venue: '', played: 0 },
      teams,
      action: '/fixtures',
      heading: 'Add a fixture',
      lockTeams: false,
    });
  });

  app.post('/fixtures', (req, res, next) => {
    try {
      const fixture = store.createFixture(req.body);
      return noticeRedirect(res, `/fixtures/${fixture.id}`, 'Fixture saved.');
    } catch (err) {
      return renderFormError(res, next, 'fixtures/form', {
        title: 'Add fixture',
        fixture: { ...req.body, played: 0 },
        teams: store.listTeams(),
        action: '/fixtures',
        heading: 'Add a fixture',
        lockTeams: false,
      }, err);
    }
  });

  app.get('/fixtures/:id', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const fixture = id && store.getFixture(id);
    if (!fixture) return next();
    res.render('fixtures/show', {
      title: `${fixture.home_team_name} vs ${fixture.away_team_name}`,
      fixture,
    });
  });

  app.get('/fixtures/:id/edit', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const fixture = id && store.getFixture(id);
    if (!fixture) return next();
    res.render('fixtures/form', {
      title: 'Edit fixture',
      fixture,
      teams: store.listTeams(),
      action: `/fixtures/${fixture.id}`,
      heading: 'Edit fixture',
      lockTeams: Boolean(fixture.played),
    });
  });

  app.post('/fixtures/:id', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const existing = id && store.getFixture(id);
    if (!existing) return next();
    try {
      store.updateFixture(id, req.body);
      return noticeRedirect(res, `/fixtures/${id}`, 'Fixture updated.');
    } catch (err) {
      return renderFormError(res, next, 'fixtures/form', {
        title: 'Edit fixture',
        fixture: { ...existing, ...req.body },
        teams: store.listTeams(),
        action: `/fixtures/${id}`,
        heading: 'Edit fixture',
        lockTeams: Boolean(existing.played),
      }, err);
    }
  });

  app.post('/fixtures/:id/delete', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const fixture = id && store.getFixture(id);
    if (!fixture) return next();
    const dest = fixture.played ? '/results' : '/fixtures';
    store.deleteFixture(id);
    return noticeRedirect(res, dest, 'Fixture deleted.');
  });

  app.get('/fixtures/:id/result', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const fixture = id && store.getFixture(id);
    if (!fixture) return next();
    res.render('results/form', {
      title: fixture.played ? 'Edit result' : 'Enter result',
      fixture,
    });
  });

  app.post('/fixtures/:id/result', (req, res, next) => {
    const id = parseRouteId(req.params.id);
    const fixture = id && store.getFixture(id);
    if (!fixture) return next();
    try {
      store.recordResult(id, req.body);
      return noticeRedirect(res, '/results', 'Result saved.');
    } catch (err) {
      return renderFormError(res, next, 'results/form', {
        title: fixture.played ? 'Edit result' : 'Enter result',
        fixture: { ...fixture, ...req.body },
      }, err);
    }
  });

  // Results and table
  app.get('/results', (req, res) => {
    res.render('results/index', {
      title: 'Results',
      results: store.listResults(),
    });
  });

  app.get('/table', (req, res) => {
    res.render('table', {
      title: 'League table',
      table: store.leagueTable(),
    });
  });

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Not found',
      code: 404,
      message: 'That page was not found. Use the menu to get back.',
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      if (res.headersSent) return;
      return res.status(400).render('error', {
        title: 'Check your details',
        code: 400,
        message: err.messages.join(' '),
        errors: err.messages,
      });
    }
    console.error(err);
    if (res.headersSent) return;
    res.status(500).render('error', {
      title: 'Something went wrong',
      code: 500,
      message: 'Something went wrong on this side. Please try again.',
    });
  });

  app.locals.store = store;
  app.locals.db = db;
  return app;
}

module.exports = { createApp };
