'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { memoryDb } = require('./helpers');
const { createStore, ValidationError } = require('../src/store');

describe('store', () => {
  let store;

  beforeEach(() => {
    store = createStore(memoryDb());
  });

  describe('teams', () => {
    it('creates, lists, updates and deletes a team', () => {
      const team = store.createTeam({ name: 'Team A', short_name: 'TA', colour: '#1f6b3a' });
      assert.equal(team.name, 'Team A');
      assert.equal(team.short_name, 'TA');
      assert.equal(team.colour, '#1F6B3A');
      assert.equal(store.listTeams().length, 1);

      const updated = store.updateTeam(team.id, { name: 'Team Alpha', short_name: 'TAL', colour: '#abc' });
      assert.equal(updated.name, 'Team Alpha');
      assert.equal(updated.colour, '#AABBCC');

      assert.equal(store.deleteTeam(team.id), true);
      assert.equal(store.listTeams().length, 0);
    });

    it('requires a name and rejects a duplicate name', () => {
      assert.throws(() => store.createTeam({ name: '  ' }), ValidationError);
      store.createTeam({ name: 'Team A' });
      assert.throws(() => store.createTeam({ name: 'team a' }), /already exists/i);
    });

    it('rejects an invalid colour', () => {
      assert.throws(() => store.createTeam({ name: 'Team A', colour: 'red' }), /hex/i);
    });

    it('refuses to delete a team that is in a fixture, and removes its players otherwise', () => {
      const a = store.createTeam({ name: 'Team A' });
      const b = store.createTeam({ name: 'Team B' });
      store.createPlayer(a.id, { name: 'Player 1', squad_number: 1, position: 'GK' });
      store.createFixture({
        home_team_id: a.id,
        away_team_id: b.id,
        kickoff: '2026-09-01T15:00',
      });
      assert.throws(() => store.deleteTeam(a.id), /fixtures/i);
      store.deleteFixture(store.listUpcoming()[0].id);
      assert.equal(store.deleteTeam(a.id), true);
      assert.equal(store.listPlayers(a.id).length, 0);
    });
  });

  describe('players', () => {
    it('adds, edits and removes players on a team', () => {
      const team = store.createTeam({ name: 'Team A' });
      const player = store.createPlayer(team.id, { name: 'Player 1', squad_number: 9, position: 'fwd' });
      assert.equal(player.position, 'FWD');
      assert.equal(store.listPlayers(team.id).length, 1);

      const updated = store.updatePlayer(player.id, { name: 'Player One', squad_number: 10, position: 'MID' });
      assert.equal(updated.name, 'Player One');
      assert.equal(updated.squad_number, 10);

      assert.equal(store.deletePlayer(player.id), true);
      assert.equal(store.listPlayers(team.id).length, 0);
    });

    it('requires a unique squad number within the team and a valid position', () => {
      const a = store.createTeam({ name: 'Team A' });
      const b = store.createTeam({ name: 'Team B' });
      store.createPlayer(a.id, { name: 'Player 1', squad_number: 1, position: 'GK' });
      assert.throws(
        () => store.createPlayer(a.id, { name: 'Player 2', squad_number: 1, position: 'DEF' }),
        /squad number/i
      );
      const other = store.createPlayer(b.id, { name: 'Player 3', squad_number: 1, position: 'GK' });
      assert.ok(other.id);
      assert.throws(
        () => store.createPlayer(a.id, { name: 'Player 4', squad_number: 2, position: 'WING' }),
        /Position must be/i
      );
      assert.throws(
        () => store.createPlayer(a.id, { name: 'Player 5', squad_number: 'nope', position: 'MID' }),
        /Squad number/i
      );
    });

    it('allows squad number 0 and keeps it unique when editing', () => {
      const team = store.createTeam({ name: 'Team A' });
      const keeper = store.createPlayer(team.id, { name: 'Player 1', squad_number: 0, position: 'GK' });
      store.createPlayer(team.id, { name: 'Player 2', squad_number: 8, position: 'MID' });
      assert.equal(keeper.squad_number, 0);
      assert.throws(
        () => store.updatePlayer(keeper.id, { name: 'Player 1', squad_number: 8, position: 'GK' }),
        /squad number/i
      );
    });
  });

  describe('fixtures and results', () => {
    it('creates fixtures between two different teams and lists them by date', () => {
      const a = store.createTeam({ name: 'Team A' });
      const b = store.createTeam({ name: 'Team B' });
      const later = store.createFixture({
        home_team_id: a.id,
        away_team_id: b.id,
        kickoff: '2026-12-20T15:00',
        venue: 'Park Ground',
      });
      const earlier = store.createFixture({
        home_team_id: b.id,
        away_team_id: a.id,
        kickoff: '2026-12-06T15:00',
      });
      const upcoming = store.listUpcoming();
      assert.equal(upcoming.length, 2);
      assert.equal(upcoming[0].id, earlier.id);
      assert.equal(upcoming[1].id, later.id);
      assert.equal(upcoming[1].venue, 'Park Ground');
    });

    it('rejects the same team twice, a missing team, or a bad date', () => {
      const a = store.createTeam({ name: 'Team A' });
      assert.throws(
        () => store.createFixture({ home_team_id: a.id, away_team_id: a.id, kickoff: '2026-09-01T15:00' }),
        /different/i
      );
      assert.throws(
        () => store.createFixture({ home_team_id: a.id, away_team_id: 999, kickoff: '2026-09-01T15:00' }),
        /not found/i
      );
      const b = store.createTeam({ name: 'Team B' });
      assert.throws(
        () => store.createFixture({ home_team_id: a.id, away_team_id: b.id, kickoff: '2026-02-30T15:00' }),
        /valid date/i
      );
    });

    it('records and edits a result with non-negative whole numbers', () => {
      const a = store.createTeam({ name: 'Team A' });
      const b = store.createTeam({ name: 'Team B' });
      const fixture = store.createFixture({
        home_team_id: a.id,
        away_team_id: b.id,
        kickoff: '2026-09-01T15:00',
      });
      assert.throws(() => store.recordResult(fixture.id, { home_goals: '-1', away_goals: '0' }), /Home score/i);
      const played = store.recordResult(fixture.id, { home_goals: '2', away_goals: '1' });
      assert.equal(played.played, 1);
      assert.equal(played.home_goals, 2);
      assert.equal(store.listUpcoming().length, 0);
      assert.equal(store.listResults().length, 1);

      const edited = store.recordResult(fixture.id, { home_goals: 0, away_goals: 0 });
      assert.equal(edited.home_goals, 0);
      assert.equal(edited.away_goals, 0);
    });

    it('locks team changes on a played fixture but still allows date and venue edits', () => {
      const a = store.createTeam({ name: 'Team A' });
      const b = store.createTeam({ name: 'Team B' });
      const c = store.createTeam({ name: 'Team C' });
      const fixture = store.createFixture({
        home_team_id: a.id,
        away_team_id: b.id,
        kickoff: '2026-09-01T15:00',
        venue: 'Old Ground',
      });
      store.recordResult(fixture.id, { home_goals: 1, away_goals: 0 });
      const updated = store.updateFixture(fixture.id, {
        home_team_id: c.id,
        away_team_id: b.id,
        kickoff: '2026-09-02T18:00',
        venue: 'New Ground',
      });
      assert.equal(updated.home_team_id, a.id);
      assert.equal(updated.kickoff, '2026-09-02T18:00');
      assert.equal(updated.venue, 'New Ground');
    });
  });

  describe('league table', () => {
    it('computes P, W, D, L, GF, GA, GD and points, and sorts by Pts, GD, GF, then name', () => {
      const a = store.createTeam({ name: 'Team A' });
      const b = store.createTeam({ name: 'Team B' });
      const c = store.createTeam({ name: 'Team C' });
      const d = store.createTeam({ name: 'Team D' });

      const f1 = store.createFixture({ home_team_id: a.id, away_team_id: b.id, kickoff: '2026-09-01T15:00' });
      const f2 = store.createFixture({ home_team_id: c.id, away_team_id: d.id, kickoff: '2026-09-01T15:00' });
      const f3 = store.createFixture({ home_team_id: a.id, away_team_id: d.id, kickoff: '2026-09-08T15:00' });
      store.recordResult(f1.id, { home_goals: 2, away_goals: 0 }); // A +3, GD +2, GF 2
      store.recordResult(f2.id, { home_goals: 3, away_goals: 1 }); // C +3, GD +2, GF 3
      store.recordResult(f3.id, { home_goals: 1, away_goals: 1 }); // A and D +1

      const table = store.leagueTable();
      assert.deepEqual(table.map((row) => row.name), ['Team A', 'Team C', 'Team D', 'Team B']);

      const [first, second, third, fourth] = table;
      assert.equal(first.played, 2);
      assert.equal(first.won, 1);
      assert.equal(first.drawn, 1);
      assert.equal(first.lost, 0);
      assert.equal(first.gf, 3);
      assert.equal(first.ga, 1);
      assert.equal(first.gd, 2);
      assert.equal(first.pts, 4);

      assert.equal(second.played, 1);
      assert.equal(second.won, 1);
      assert.equal(second.pts, 3);
      assert.equal(second.gd, 2);
      assert.equal(second.gf, 3);

      assert.equal(third.played, 2);
      assert.equal(third.drawn, 1);
      assert.equal(third.lost, 1);
      assert.equal(third.pts, 1);
      assert.equal(third.gd, -2);

      assert.equal(fourth.played, 1);
      assert.equal(fourth.lost, 1);
      assert.equal(fourth.pts, 0);
      assert.equal(fourth.gf, 0);
    });

    it('breaks ties by goal difference, then goals for, then name', () => {
      const a = store.createTeam({ name: 'Team A' });
      const b = store.createTeam({ name: 'Team B' });
      const c = store.createTeam({ name: 'Team C' });
      const d = store.createTeam({ name: 'Team D' });
      const f1 = store.createFixture({ home_team_id: a.id, away_team_id: b.id, kickoff: '2026-09-01T15:00' });
      const f2 = store.createFixture({ home_team_id: c.id, away_team_id: d.id, kickoff: '2026-09-01T15:00' });
      store.recordResult(f1.id, { home_goals: 2, away_goals: 0 });
      store.recordResult(f2.id, { home_goals: 3, away_goals: 1 });
      assert.deepEqual(
        store.leagueTable().map((row) => row.name),
        ['Team C', 'Team A', 'Team D', 'Team B']
      );
    });

    it('includes teams with no matches and ignores unplayed fixtures', () => {
      store.createTeam({ name: 'Team B' });
      store.createTeam({ name: 'Team A' });
      const c = store.createTeam({ name: 'Team C' });
      const d = store.createTeam({ name: 'Team D' });
      store.createFixture({ home_team_id: c.id, away_team_id: d.id, kickoff: '2026-12-01T15:00' });
      const table = store.leagueTable();
      assert.deepEqual(table.map((row) => row.name), ['Team A', 'Team B', 'Team C', 'Team D']);
      assert.ok(table.every((row) => row.played === 0 && row.pts === 0));
    });
  });
});
