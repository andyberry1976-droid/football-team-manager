'use strict';

const { openDb } = require('../src/db');
const { createStore } = require('../src/store');

function main() {
  const db = openDb();
  const store = createStore(db);
  if (store.listTeams().length) {
    console.log('The database already has teams. Seed was not applied.');
    return;
  }

  const teamA = store.createTeam({ name: 'Team A', short_name: 'TA', colour: '#1F6B3A' });
  const teamB = store.createTeam({ name: 'Team B', short_name: 'TB', colour: '#1D4E89' });
  const teamC = store.createTeam({ name: 'Team C', short_name: 'TC', colour: '#8A1C1C' });
  const teamD = store.createTeam({ name: 'Team D', short_name: 'TD', colour: '#7A5C12' });

  const squads = [
    [teamA.id, [
      ['Player 1', 1, 'GK'],
      ['Player 2', 4, 'DEF'],
      ['Player 3', 8, 'MID'],
      ['Player 4', 9, 'FWD'],
    ]],
    [teamB.id, [
      ['Player 5', 1, 'GK'],
      ['Player 6', 5, 'DEF'],
      ['Player 7', 6, 'MID'],
      ['Player 8', 11, 'FWD'],
    ]],
    [teamC.id, [
      ['Player 9', 1, 'GK'],
      ['Player 10', 3, 'DEF'],
      ['Player 11', 10, 'MID'],
      ['Player 12', 7, 'FWD'],
    ]],
    [teamD.id, [
      ['Player 13', 1, 'GK'],
      ['Player 14', 2, 'DEF'],
      ['Player 15', 8, 'MID'],
      ['Player 16', 9, 'FWD'],
    ]],
  ];

  for (const [teamId, players] of squads) {
    for (const [name, squadNumber, position] of players) {
      store.createPlayer(teamId, { name, squad_number: squadNumber, position });
    }
  }

  const played = [
    store.createFixture({
      home_team_id: teamA.id,
      away_team_id: teamB.id,
      kickoff: '2026-09-05T15:00',
      venue: 'Park Ground',
    }),
    store.createFixture({
      home_team_id: teamC.id,
      away_team_id: teamD.id,
      kickoff: '2026-09-05T15:00',
      venue: 'Hill Ground',
    }),
    store.createFixture({
      home_team_id: teamA.id,
      away_team_id: teamC.id,
      kickoff: '2026-09-12T15:00',
      venue: 'Park Ground',
    }),
  ];

  store.recordResult(played[0].id, { home_goals: 2, away_goals: 1 });
  store.recordResult(played[1].id, { home_goals: 3, away_goals: 1 });
  store.recordResult(played[2].id, { home_goals: 0, away_goals: 0 });

  store.createFixture({
    home_team_id: teamB.id,
    away_team_id: teamD.id,
    kickoff: '2026-12-05T15:00',
    venue: 'River Ground',
  });
  store.createFixture({
    home_team_id: teamD.id,
    away_team_id: teamA.id,
    kickoff: '2026-12-12T15:00',
    venue: 'Lane Ground',
  });
  store.createFixture({
    home_team_id: teamB.id,
    away_team_id: teamC.id,
    kickoff: '2026-12-19T15:00',
    venue: 'River Ground',
  });

  console.log('Example data loaded: 4 teams, 16 players, 3 results and 3 upcoming fixtures.');
}

main();
