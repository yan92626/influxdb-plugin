# InfluxDB3 Head

English | [简体中文](README.md)

InfluxDB3 Head is a Chrome extension for managing self-hosted InfluxDB 3.x instances. It provides a visual interface similar to elasticsearch-head, allowing users to browse database structures, run queries, analyze time-series data, write data, and manage databases without repeatedly composing command-line requests.

The project supports InfluxDB 3 Core and InfluxDB 3 Enterprise and is intended for local development, test environment troubleshooting, and routine operations.

## Features

### Connection Management

- Save and switch between multiple InfluxDB instances.
- Test connections with a server URL and API token, and display instance health and version information.
- Configure a default database for restricted tokens that cannot call the database listing API.
- Store connection settings in Chrome's local extension storage.

### Database and Table Browsing

- Browse databases, tables, and columns in a tree view.
- Distinguish time, tag, and field columns.
- Click a table to preview recent data within the selected time range.
- View instance health, version, and table counts on the Overview page.

### Queries and Data Analysis

- Run SQL and InfluxQL queries.
- Select an IANA time zone used consistently by query results, chart axes, and hover details.
- Run queries with `Command/Ctrl + Enter`.
- Restore recent query history, including its database, language, and time zone.
- Display results as a table or time-series chart and export them as CSV or JSON.
- Select chart metrics, split series by dimensions, aggregate time buckets, toggle series, inspect statistics, and zoom.

### Data Writing and Administration

- Write Line Protocol data with a selectable timestamp precision.
- Create databases.
- Require database name confirmation before deletion.
- Protect dangerous queries and warn about unbounded queries without time filters or `LIMIT` clauses.

## Compatibility

- Google Chrome or another browser that can load Chrome Manifest V3 extensions.
- Self-hosted InfluxDB 3 Core or InfluxDB 3 Enterprise.
- InfluxDB 3.x `/api/v3` endpoints.
- InfluxDB 1.x, InfluxDB 2.x, and InfluxDB Cloud are not supported.

## Installation

Installing a packaged GitHub Release is recommended. Build from source when developing or modifying the extension.

### Install from a GitHub Release

1. Open the project's [GitHub Releases](https://github.com/yan92626/influxdb-plugin/releases).
2. Download both files for the latest version:
   - `influxdb3-head-vX.Y.Z.zip`
   - `influxdb3-head-vX.Y.Z.zip.sha256`
3. Optionally, but preferably, verify the archive in the directory containing both files:

   ```bash
   shasum -a 256 -c influxdb3-head-vX.Y.Z.zip.sha256
   ```

4. Extract the zip archive into a permanent directory. Do not move or delete that directory after installing the extension.
5. Open `chrome://extensions` in Chrome.
6. Enable **Developer mode**.
7. Click **Load unpacked** and select the extracted directory.
8. Find InfluxDB3 Head in Chrome's extension menu and optionally pin it to the toolbar.

### Install from Source

Node.js 22 or later, npm, and Google Chrome are required.

```bash
git clone https://github.com/yan92626/influxdb-plugin.git
cd influxdb-plugin
npm ci
npm run build
```

After the build completes, open `chrome://extensions`, click **Load unpacked**, and select the project's `dist/` directory.

After rebuilding the project, click **Reload** on the extension card and reopen any extension pages that were already open.

## Initial Setup

The connection manager opens automatically the first time the extension is launched. Configure the following fields:

| Field | Description | Example |
| --- | --- | --- |
| Name | Identifies a development, test, or production environment | `Monitoring Test` |
| URL | InfluxDB 3 server URL, including `http://` or `https://` | `http://127.0.0.1:8181` |
| Token | InfluxDB 3 API token without the `Bearer ` prefix | `apiv3_xxx...` |
| Default database | Optional; recommended when a restricted token cannot list databases | `monitoring` |

Click **Test connection** and confirm that the health status and server version are displayed before saving. Use the connection selector in the top bar to switch between instances later.

## Usage

### Browse and Preview Data

1. Open the **Workspace** page.
2. Expand a database and table in the navigation tree.
3. Expand a table to inspect its columns, or click the table name to generate and run a recent-data preview query.
4. Use **Preview range** to select the last 5 minutes, 1 hour, 1 day, or another supported range.

### Run a Query

1. Select a database, SQL or InfluxQL, and the result time zone.
2. Enter a query in the editor.
3. Click **Run**, or press `Command + Enter` on macOS or `Ctrl + Enter` on Windows and Linux.

SQL example:

```sql
SELECT *
FROM "cpu"
WHERE time >= now() - INTERVAL '1 hour'
ORDER BY time DESC
LIMIT 1000
```

The extension applies the following query safeguards:

- A configured maximum row limit is appended when a SELECT query has no `LIMIT`.
- Queries without a time condition require confirmation before execution.
- Dangerous statements such as `DROP` and `DELETE` require confirmation.

### View a Time-Series Chart

The chart view is available when query results contain a `time` column and at least one numeric column:

- Select the numeric metric to display.
- Split series using tags or other non-numeric columns.
- Aggregate values using last, average, minimum, or maximum.
- Select automatic or fixed time buckets.
- Click legend entries to hide or show individual series.
- Drag to select a zoom range, use the mouse wheel to zoom, and double-click or use the reset button to restore the full range.

### Write Data

Open the **Write** page, select a database, paste Line Protocol data, choose the timestamp precision, and submit it. The token must have write access to the target database.

```text
temperature,host=node-01 value=42.5
```

### Manage Databases

Open the **Admin** page to create or delete databases. These operations normally require administrative permissions. Deleting a database requires entering its name as confirmation.

## Security

- Tokens are stored as plaintext in the local `chrome.storage.local` store and are not uploaded by this project.
- The extension sends requests directly to the configured InfluxDB server.
- Do not store production tokens on shared computers.
- Prefer tokens with only the permissions required for their intended use.

## Development and Verification

```bash
npm run dev           # Start the Vite development server
npm test              # Run unit tests
npm run typecheck     # Run TypeScript checks
npm run version:check # Verify package, lockfile, manifest, and Changelog versions
npm run package       # Generate zip and SHA-256 files under release/
```

See [INSTALL.md](INSTALL.md) for detailed installation troubleshooting, [CHANGELOG.md](CHANGELOG.md) for version history, and [RELEASING.md](RELEASING.md) for the maintainer release workflow.
