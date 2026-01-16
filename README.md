# Minimal Node.js Hello API

This is a minimal Node.js application using Express that exposes a single API endpoint returning `hello`. Suitable for deployment and pushing to GitHub.

## Requirements

- Node.js (>= 16 recommended)
- npm (comes with Node)

## Install

```bash
npm install
```

## Run locally

```bash
npm start
```

The server will start on [http://localhost:3000](http://localhost:3000).

- `GET /` → returns a simple "Server is running" message
- `GET /api/hello` → returns JSON: `{ "message": "hello" }`

## Deploying

You can push this repo to GitHub as-is. For most Node hosting providers, you only need to:

- Set the start command to `npm start`
- Optionally configure the `PORT` environment variable; otherwise it defaults to `3000`.
