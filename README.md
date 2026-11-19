# Football Team Manager

A standalone, offline web app for managing football teams, players, match schedules, results and a league table. It uses Node.js 22+, Express, EJS and the built-in SQLite module. After `npm install` it runs entirely on your machine: no outside services, fonts or scripts are required.

## Features

- **Teams** — add, edit and delete a team, with a name plus an optional short name and colour.
- **Players** — add, edit and remove players on a team. Each player has a name, a squad number that is unique within the team, and a position (GK, DEF, MID or FWD).
- **Fixtures** — schedule a match between two different teams, with a date, time and venue. Upcoming (unplayed) fixtures are listed in date order. Fixtures can be edited or deleted.
- **Results** — enter or edit a score (whole numbers of 0 or more) and mark a fixture as played. Played matches appear on the results list.
- **League table** — computed from results: played, won, drawn, lost, goals for, goals against, goal difference and points (3 for a win, 1 for a draw, 0 for a loss). The table is sorted by points, then goal difference, then goals for, then team name.
- Validation messages appear on the form when something is missing or invalid.

## Setup

```
npm install
```

## Run

```
npm start
```

The app listens on port 3000, or the port in the `PORT` environment variable. The database file is created automatically at `data/app.db`, or at the path in the `DB_FILE` environment variable.

To load made-up example data (Team A, Team B, Player 1, and so on):

```
npm run seed
```

Run the seed only against an empty database. It will exit without changes if teams already exist.

## Test

```
npm test
```

Tests cover store logic (teams, players, fixtures, results and the league table) and the HTTP routes, starting the app on an ephemeral port.

## Project structure

```
package.json
src/server.js          Starts the HTTP server
src/app.js             Express app and routes
src/db.js              Opens SQLite (built into Node) and creates the schema
src/store.js           Data access, validation and league table
src/views/             Server-rendered pages
public/styles.css      Local stylesheet
scripts/seed.js        Optional example data
test/                  Automated tests
data/                  Database file (created on first run)
```
