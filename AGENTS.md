# Working rules for RouteOverlay

These rules apply to future work in this repository.

- Develop in this repository on the computer where the project is open. Keep any machine-specific path in `LOCAL.md`. That file is gitignored.
- Do not use a Cursor Cloud Agent for local development. A Cloud Agent runs on another machine, and a server it starts is not `http://localhost:3000` on this computer.
- Keep all source code, comments, documentation, and Git commit messages in English.
- Preserve the existing research evidence in `docs/FEASIBILITY.md`, `docs/REAL-URL-EVIDENCE.md`, and `docs/evidence/`. Do not replace those findings with speculation.
- Run the project tests before publishing changes: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, and `npm run build`.
- Do not call paid Google APIs unless the user explicitly authorizes that call. Leave `ROUTE_OVERLAY_GOOGLE_API_ENABLED` false by default. Do not add a real API key to the repository.
- Do not deploy automatically. Do not create Vercel or other hosted infrastructure unless the user explicitly asks.
- Do not delete, overwrite, or reformat unrelated files outside this project.
- Bind local `dev` and `start` to `127.0.0.1`. Do not listen on all interfaces.
- Validate every short-link redirect target before requesting it. Keep the exact Google Maps hostname allowlist, HTTPS-only expansion, the redirect limit, and the rejection of private or local addresses.
