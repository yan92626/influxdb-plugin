# InfluxDB3 Head

English | [简体中文](README.md)

A Chrome extension for visually browsing, querying, writing, and managing
self-hosted InfluxDB 3.x instances, similar to what elasticsearch-head provides
for Elasticsearch.

## Features

- Manage multiple connections with URL and token health checks.
- Browse databases, tables, and schemas with time, tag, and field roles.
- Run SQL and InfluxQL queries with selectable IANA time zones.
- View query results as tables or time-series charts.
- Export query results as CSV or JSON and restore recent query history.
- Write Line Protocol data.
- Create and delete databases with confirmation safeguards.

## Install from Source

Requirements: Node.js 22 or later, npm, and Google Chrome.

```bash
git clone https://github.com/yan92626/influxdb-plugin.git
cd influxdb-plugin
npm ci
npm run build
```

Then install the unpacked extension:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist/` directory.
5. Open InfluxDB3 Head from the Chrome toolbar.

After rebuilding, click **Reload** on the extension card in
`chrome://extensions` and reopen any existing extension tabs.

## Install from a Release

Download `influxdb3-head-vX.Y.Z.zip` and its matching `.sha256` file from
[GitHub Releases](https://github.com/yan92626/influxdb-plugin/releases).
Verify the archive before extracting it:

```bash
shasum -a 256 -c influxdb3-head-vX.Y.Z.zip.sha256
```

Extract the archive to a permanent directory, then load that directory through
Chrome's **Load unpacked** action. Do not move or delete the directory while the
extension is installed.

## Development

```bash
npm run dev           # Start the Vite development server
npm test              # Run unit tests
npm run typecheck     # Run TypeScript checks
npm run version:check # Verify package, lockfile, manifest, and changelog versions
npm run package       # Build zip and SHA-256 files under release/
```

When running through the Vite development server, browser extension storage
falls back to `localStorage`.

## Release Management

The project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- See [CHANGELOG.md](CHANGELOG.md) for version history.
- See [RELEASING.md](RELEASING.md) for the maintainer release workflow.
- Pushing a `vX.Y.Z` tag runs tests, builds the extension, and creates a GitHub
  Release containing the zip archive and SHA-256 checksum.

## Security

Connection tokens are stored as plaintext in `chrome.storage.local`. They stay
on the local machine and are only accessible to this extension, but production
tokens should not be saved on shared computers.

## Compatibility

InfluxDB3 Head supports the InfluxDB 3.x `/api/v3` endpoints provided by
self-hosted Core and Enterprise editions. InfluxDB 1.x, InfluxDB 2.x, and
InfluxDB Cloud are not supported.
