'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, get, post } = require('./helpers');
const { createStore } = require('../src/store');

describe('HTTP routes', () => {
  let base;
  let close;
  let store;

  before(async () => {
    const started = await startApp();
    base = started.base;
    close = started.close;
    store = started.app.locals.store;
  });

  after(async () => {
    await close();
  });

  it('serves the home, teams, fixtures, results and table pages', async () => {
    for (const path of ['/', '/teams', '/fixtures', '/results', '/table']) {
      const res = await get(base, path);
      assert.equal(res.status, 200, path);
      assert.match(res.body, /Football Team Manager/);
    }
  });

  it('creates a team and shows it on the teams page', async () => {
    const created = await post(base, '/teams', {
      name: 'Team A',
      short_name: 'TA',
      colour: '#1F6B3A',
    });
    assert.equal(created.status, 302);
    assert.match(created.location, /\/teams\/\d+/);
    assert.match(created.location, /notice=Team%20saved/);

    const show = await get(base, created.location.replace(/\?.*$/, ''));
    assert.equal(show.status, 200);
    assert.match(show.body, /Team A/);
    assert.match(show.body, />TA</);

    const list = await get(base, '/teams');
    assert.match(list.body, /Team A/);
  });

  it('shows a clear error when a team name is missing or already used', async () => {
    const missing = await post(base, '/teams', { name: '' });
    assert.equal(missing.status, 400);
    assert.match(missing.body, /Team name is required/);

    const duplicate = await post(base, '/teams', { name: 'Team A' });
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.body, /already exists/);
  });

  it('adds, edits and removes a player on a team', async () => {
    const team = store.listTeams().find((row) => row.name === 'Team A');
    const created = await post(base, `/teams/${team.id}/players`, {
      name: 'Player 1',
      squad_number: '9',
      position: 'FWD',
    });
    assert.equal(created.status, 302);
    const show = await get(base, `/teams/${team.id}`);
    assert.match(show.body, /Player 1/);
    assert.match(show.body, /Forward/);

    const player = store.listPlayers(team.id)[0];
    const edited = await post(base, `/players/${player.id}`, {
      name: 'Player One',
      squad_number: '10',
      position: 'MID',
    });
    assert.equal(edited.status, 302);
    const afterEdit = await get(base, `/teams/${team.id}`);
    assert.match(afterEdit.body, /Player One/);
    assert.match(afterEdit.body, /Midfielder/);

    const clash = await post(base, `/teams/${team.id}/players`, {
      name: 'Player 2',
      squad_number: '10',
      position: 'DEF',
    });
    assert.equal(clash.status, 400);
    assert.match(clash.body, /squad number/i);

    const removed = await post(base, `/players/${player.id}/delete`);
    assert.equal(removed.status, 302);
    const afterDelete = await get(base, `/teams/${team.id}`);
    assert.doesNotMatch(afterDelete.body, /Player One/);
  });

  it('schedules a fixture, lists it by date, and rejects the same team twice', async () => {
    const a = store.listTeams().find((row) => row.name === 'Team A');
    let b = store.listTeams().find((row) => row.name === 'Team B');
    if (!b) {
      const created = await post(base, '/teams', { name: 'Team B', short_name: 'TB', colour: '#1D4E89' });
      assert.equal(created.status, 302);
      b = store.listTeams().find((row) => row.name === 'Team B');
    }

    const later = await post(base, '/fixtures', {
      home_team_id: String(a.id),
      away_team_id: String(b.id),
      kickoff: '2026-12-20T15:00',
      venue: 'Park Ground',
    });
    assert.equal(later.status, 302);

    const earlier = await post(base, '/fixtures', {
      home_team_id: String(b.id),
      away_team_id: String(a.id),
      kickoff: '2026-12-06T15:00',
      venue: 'Hill Ground',
    });
    assert.equal(earlier.status, 302);

    const same = await post(base, '/fixtures', {
      home_team_id: String(a.id),
      away_team_id: String(a.id),
      kickoff: '2026-12-13T15:00',
    });
    assert.equal(same.status, 400);
    assert.match(same.body, /different/);

    const list = await get(base, '/fixtures');
    assert.equal(list.status, 200);
    const first = list.body.indexOf('6 Dec 2026');
    const second = list.body.indexOf('20 Dec 2026');
    assert.ok(first !== -1 && second !== -1 && first < second);
    assert.match(list.body, /Park Ground/);
  });

  it('records a result, lists it, and updates the league table', async () => {
    const fixture = store.listUpcoming().find((row) => row.kickoff === '2026-12-06T15:00');
    assert.ok(fixture);

    const bad = await post(base, `/fixtures/${fixture.id}/result`, {
      home_goals: '-1',
      away_goals: '0',
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body, /Home score/);

    const saved = await post(base, `/fixtures/${fixture.id}/result`, {
      home_goals: '2',
      away_goals: '1',
    });
    assert.equal(saved.status, 302);
    assert.match(saved.location, /\/results/);

    const results = await get(base, '/results');
    assert.equal(results.status, 200);
    assert.match(results.body, /2–1/);

    const table = await get(base, '/table');
    assert.equal(table.status, 200);
    assert.match(table.body, />Pts</);
    // Team B won 2-1 at home against Team A
    const body = table.body;
    const posB = body.indexOf('Team B');
    const posA = body.indexOf('Team A');
    assert.ok(posB !== -1 && posA !== -1 && posB < posA);
    assert.match(body, />3</);
  });

  it('edits a result and rebuilds the table, then deletes a fixture', async () => {
    const fixture = store.listResults()[0];
    const edited = await post(base, `/fixtures/${fixture.id}/result`, {
      home_goals: '0',
      away_goals: '0',
    });
    assert.equal(edited.status, 302);
    const results = await get(base, '/results');
    assert.match(results.body, /0–0/);

    const table = store.leagueTable();
    const a = table.find((row) => row.name === 'Team A');
    const b = table.find((row) => row.name === 'Team B');
    assert.equal(a.pts, 1);
    assert.equal(b.pts, 1);
    assert.equal(a.drawn, 1);
    assert.equal(b.drawn, 1);

    const deleted = await post(base, `/fixtures/${fixture.id}/delete`);
    assert.equal(deleted.status, 302);
    const after = store.leagueTable();
    assert.ok(after.every((row) => row.played === 0));
  });

  it('returns 404 for a missing page', async () => {
    const res = await get(base, '/teams/99999');
    assert.equal(res.status, 404);
    assert.match(res.body, /not found/i);
  });

  it('blocks deleting a team that still has a fixture and allows it once the fixture is gone', async () => {
    const a = store.listTeams().find((row) => row.name === 'Team A');
    const b = store.listTeams().find((row) => row.name === 'Team B');
    const leftover = store.listUpcoming().find((row) =>
      (row.home_team_id === a.id && row.away_team_id === b.id) ||
      (row.home_team_id === b.id && row.away_team_id === a.id)
    );
    assert.ok(leftover);
    const blocked = await post(base, `/teams/${a.id}/delete`);
    assert.equal(blocked.status, 400);
    assert.match(blocked.body, /cannot be deleted/);

    await post(base, `/fixtures/${leftover.id}/delete`);
    const deleted = await post(base, `/teams/${a.id}/delete`);
    assert.equal(deleted.status, 302);
    const list = await get(base, '/teams');
    assert.doesNotMatch(list.body, /Team A/);
    assert.match(list.body, /Team B/);
  });
});
