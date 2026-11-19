'use strict';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const POSITION_LABELS = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

class ValidationError extends Error {
  constructor(messages) {
    const list = Array.isArray(messages) ? messages : [messages];
    super(list.join(' '));
    this.name = 'ValidationError';
    this.messages = list;
  }
}

function trim(value) {
  return String(value ?? '').trim();
}

function requireText(value, label, { max = 80 } = {}) {
  const text = trim(value);
  if (!text) throw new ValidationError(`${label} is required.`);
  if (text.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return text;
}

function optionalText(value, label, { max = 80 } = {}) {
  const text = trim(value);
  if (!text) return null;
  if (text.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return text;
}

function parseColour(value) {
  const colour = trim(value);
  if (!colour) return null;
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(colour)) {
    throw new ValidationError('Colour must be a hex value such as #1F6B3A, or left blank.');
  }
  if (colour.length === 4) {
    return `#${colour[1]}${colour[1]}${colour[2]}${colour[2]}${colour[3]}${colour[3]}`.toUpperCase();
  }
  return colour.toUpperCase();
}

function parseSquadNumber(value) {
  const raw = trim(value);
  if (raw === '') throw new ValidationError('Squad number is required.');
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError('Squad number must be a whole number from 0 to 99.');
  }
  const number = Number(raw);
  if (number < 0 || number > 99) {
    throw new ValidationError('Squad number must be a whole number from 0 to 99.');
  }
  return number;
}

function parsePosition(value) {
  const position = trim(value).toUpperCase();
  if (!POSITIONS.includes(position)) {
    throw new ValidationError('Position must be GK, DEF, MID or FWD.');
  }
  return position;
}

function parseGoals(value, label) {
  const raw = trim(value);
  if (raw === '') throw new ValidationError(`${label} is required.`);
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError(`${label} must be a whole number of 0 or more.`);
  }
  const goals = Number(raw);
  if (goals > 99) throw new ValidationError(`${label} must be 99 or fewer.`);
  return goals;
}

function parseKickoff(value) {
  const raw = trim(value);
  if (!raw) throw new ValidationError('Date and time are required.');
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/);
  if (!match) throw new ValidationError('Date and time must be a valid date and time.');
  const iso = `${match[1]}T${match[2]}`;
  const [year, month, day] = match[1].split('-').map(Number);
  const [hour, minute] = match[2].split(':').map(Number);
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59) {
    throw new ValidationError('Date and time must be a valid date and time.');
  }
  return iso;
}

function isRealDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function parseId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return id;
}

function formatKickoff(iso) {
  if (!iso) return '';
  const [date, time] = String(iso).split('T');
  const [year, month, day] = date.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[Number(month) - 1] || month;
  return `${Number(day)} ${monthName} ${year}, ${time}`;
}

const FIXTURE_SELECT = `
  SELECT f.*,
    ht.name AS home_team_name, ht.short_name AS home_short, ht.colour AS home_colour,
    at.name AS away_team_name, at.short_name AS away_short, at.colour AS away_colour
  FROM fixtures f
  JOIN teams ht ON ht.id = f.home_team_id
  JOIN teams at ON at.id = f.away_team_id
`;

function isUniqueConstraint(err) {
  return Boolean(err && /UNIQUE/i.test(err.code || '') || err && /UNIQUE constraint failed/i.test(err.message || ''));
}

function isForeignKeyConstraint(err) {
  return Boolean(err && /FOREIGN/i.test(err.code || '') || err && /FOREIGN KEY constraint failed/i.test(err.message || ''));
}

function createStore(db) {
  function listTeams() {
    return db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS player_count
      FROM teams t
      ORDER BY t.name COLLATE NOCASE
    `).all();
  }

  function getTeam(id) {
    return db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS player_count
      FROM teams t
      WHERE t.id = ?
    `).get(id) || null;
  }

  function createTeam(input) {
    const name = requireText(input.name, 'Team name');
    const shortName = optionalText(input.short_name, 'Short name', { max: 8 });
    const colour = parseColour(input.colour);
    try {
      const result = db.prepare(
        'INSERT INTO teams (name, short_name, colour) VALUES (?, ?, ?)'
      ).run(name, shortName, colour);
      return getTeam(result.lastInsertRowid);
    } catch (err) {
      if (isUniqueConstraint(err)) {
        throw new ValidationError('A team with this name already exists.');
      }
      throw err;
    }
  }

  function updateTeam(id, input) {
    if (!getTeam(id)) return null;
    const name = requireText(input.name, 'Team name');
    const shortName = optionalText(input.short_name, 'Short name', { max: 8 });
    const colour = parseColour(input.colour);
    try {
      db.prepare('UPDATE teams SET name = ?, short_name = ?, colour = ? WHERE id = ?')
        .run(name, shortName, colour, id);
      return getTeam(id);
    } catch (err) {
      if (isUniqueConstraint(err)) {
        throw new ValidationError('A team with this name already exists.');
      }
      throw err;
    }
  }

  function deleteTeam(id) {
    if (!getTeam(id)) return false;
    try {
      db.prepare('DELETE FROM teams WHERE id = ?').run(id);
      return true;
    } catch (err) {
      if (isForeignKeyConstraint(err)) {
        throw new ValidationError('This team cannot be deleted because it is in one or more fixtures. Remove those fixtures first.');
      }
      throw err;
    }
  }

  function listPlayers(teamId) {
    return db.prepare(`
      SELECT * FROM players
      WHERE team_id = ?
      ORDER BY squad_number ASC, name COLLATE NOCASE
    `).all(teamId);
  }

  function getPlayer(id) {
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id) || null;
  }

  function createPlayer(teamId, input) {
    if (!getTeam(teamId)) throw new ValidationError('Team not found.');
    const name = requireText(input.name, 'Player name');
    const squadNumber = parseSquadNumber(input.squad_number);
    const position = parsePosition(input.position);
    try {
      const result = db.prepare(
        'INSERT INTO players (team_id, name, squad_number, position) VALUES (?, ?, ?, ?)'
      ).run(teamId, name, squadNumber, position);
      return getPlayer(result.lastInsertRowid);
    } catch (err) {
      if (isUniqueConstraint(err)) {
        throw new ValidationError('That squad number is already used in this team.');
      }
      throw err;
    }
  }

  function updatePlayer(id, input) {
    const player = getPlayer(id);
    if (!player) return null;
    const name = requireText(input.name, 'Player name');
    const squadNumber = parseSquadNumber(input.squad_number);
    const position = parsePosition(input.position);
    try {
      db.prepare('UPDATE players SET name = ?, squad_number = ?, position = ? WHERE id = ?')
        .run(name, squadNumber, position, id);
      return getPlayer(id);
    } catch (err) {
      if (isUniqueConstraint(err)) {
        throw new ValidationError('That squad number is already used in this team.');
      }
      throw err;
    }
  }

  function deletePlayer(id) {
    const info = db.prepare('DELETE FROM players WHERE id = ?').run(id);
    return info.changes > 0;
  }

  function mapFixture(row) {
    if (!row) return null;
    return row;
  }

  function listUpcoming() {
    return db.prepare(`
      ${FIXTURE_SELECT}
      WHERE f.played = 0
      ORDER BY f.kickoff ASC, f.id ASC
    `).all().map(mapFixture);
  }

  function listResults() {
    return db.prepare(`
      ${FIXTURE_SELECT}
      WHERE f.played = 1
      ORDER BY f.kickoff DESC, f.id DESC
    `).all().map(mapFixture);
  }

  function getFixture(id) {
    return mapFixture(db.prepare(`${FIXTURE_SELECT} WHERE f.id = ?`).get(id) || null);
  }

  function assertDifferentTeams(homeId, awayId) {
    if (homeId === awayId) {
      throw new ValidationError('Home and away teams must be different.');
    }
  }

  function createFixture(input) {
    const homeTeamId = parseId(input.home_team_id, 'Home team');
    const awayTeamId = parseId(input.away_team_id, 'Away team');
    assertDifferentTeams(homeTeamId, awayTeamId);
    if (!getTeam(homeTeamId)) throw new ValidationError('Home team was not found.');
    if (!getTeam(awayTeamId)) throw new ValidationError('Away team was not found.');
    const kickoff = parseKickoff(input.kickoff);
    const venue = optionalText(input.venue, 'Venue', { max: 120 });
    const result = db.prepare(
      'INSERT INTO fixtures (home_team_id, away_team_id, kickoff, venue) VALUES (?, ?, ?, ?)'
    ).run(homeTeamId, awayTeamId, kickoff, venue);
    return getFixture(result.lastInsertRowid);
  }

  function updateFixture(id, input) {
    const fixture = getFixture(id);
    if (!fixture) return null;
    const kickoff = parseKickoff(input.kickoff);
    const venue = optionalText(input.venue, 'Venue', { max: 120 });
    let homeTeamId = fixture.home_team_id;
    let awayTeamId = fixture.away_team_id;
    if (!fixture.played) {
      homeTeamId = parseId(input.home_team_id, 'Home team');
      awayTeamId = parseId(input.away_team_id, 'Away team');
      assertDifferentTeams(homeTeamId, awayTeamId);
      if (!getTeam(homeTeamId)) throw new ValidationError('Home team was not found.');
      if (!getTeam(awayTeamId)) throw new ValidationError('Away team was not found.');
    }
    db.prepare(
      'UPDATE fixtures SET home_team_id = ?, away_team_id = ?, kickoff = ?, venue = ? WHERE id = ?'
    ).run(homeTeamId, awayTeamId, kickoff, venue, id);
    return getFixture(id);
  }

  function deleteFixture(id) {
    const info = db.prepare('DELETE FROM fixtures WHERE id = ?').run(id);
    return info.changes > 0;
  }

  function recordResult(id, input) {
    const fixture = getFixture(id);
    if (!fixture) return null;
    const homeGoals = parseGoals(input.home_goals, 'Home score');
    const awayGoals = parseGoals(input.away_goals, 'Away score');
    db.prepare(
      'UPDATE fixtures SET played = 1, home_goals = ?, away_goals = ? WHERE id = ?'
    ).run(homeGoals, awayGoals, id);
    return getFixture(id);
  }

  function leagueTable() {
    const teams = listTeams();
    const rows = new Map(teams.map((team) => [team.id, {
      id: team.id,
      name: team.name,
      short_name: team.short_name,
      colour: team.colour,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0,
    }]));

    const results = db.prepare(
      'SELECT home_team_id, away_team_id, home_goals, away_goals FROM fixtures WHERE played = 1'
    ).all();

    for (const fixture of results) {
      const home = rows.get(fixture.home_team_id);
      const away = rows.get(fixture.away_team_id);
      if (!home || !away) continue;
      home.played += 1;
      away.played += 1;
      home.gf += fixture.home_goals;
      home.ga += fixture.away_goals;
      away.gf += fixture.away_goals;
      away.ga += fixture.home_goals;
      if (fixture.home_goals > fixture.away_goals) {
        home.won += 1;
        away.lost += 1;
        home.pts += 3;
      } else if (fixture.home_goals < fixture.away_goals) {
        away.won += 1;
        home.lost += 1;
        away.pts += 3;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.pts += 1;
        away.pts += 1;
      }
    }

    for (const row of rows.values()) {
      row.gd = row.gf - row.ga;
    }

    return [...rows.values()].sort((a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }

  function fixturesForTeam(teamId) {
    return db.prepare(`
      ${FIXTURE_SELECT}
      WHERE f.home_team_id = ? OR f.away_team_id = ?
      ORDER BY f.kickoff ASC, f.id ASC
    `).all(teamId, teamId);
  }

  return {
    listTeams,
    getTeam,
    createTeam,
    updateTeam,
    deleteTeam,
    listPlayers,
    getPlayer,
    createPlayer,
    updatePlayer,
    deletePlayer,
    listUpcoming,
    listResults,
    getFixture,
    createFixture,
    updateFixture,
    deleteFixture,
    recordResult,
    leagueTable,
    fixturesForTeam,
  };
}

module.exports = {
  createStore,
  ValidationError,
  POSITIONS,
  POSITION_LABELS,
  formatKickoff,
  parseId,
};
