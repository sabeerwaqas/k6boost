# k6boost

A safety-conscious TypeScript CLI for repeatable API performance tests powered by [Grafana k6](https://grafana.com/docs/k6/latest/). k6boost is a workflow wrapper, not a replacement load-testing engine.

> **Early development:** v0.1.0 is an initial MVP. APIs and report formats may change; it has not yet been published to npm.

## Requirements

- Node.js 20+
- Grafana k6 installed and available on your `PATH`
- npm

## Install for development

```bash
git clone https://github.com/sabeerwaqas/k6boost.git
cd k6boost
npm install
npm run build
npm link
```

Alternatively, run commands during development with `npm run dev -- <command>`.

## Quick start

```bash
k6boost init
k6boost add-endpoint health https://your-authorized-host.example/health --method GET
k6boost list-endpoints
k6boost test --profile smoke --allow-remote
```

Only use a real host if you own it or have explicit permission to test it. Remote targets require `--allow-remote`; localhost and private-network targets require `--allow-local`. These flags are deliberate authorization confirmations, not a substitute for checking the target.

### Commands

| Command | Purpose |
| --- | --- |
| `init` | Create `k6boost.json` without overwriting an existing file |
| `add-endpoint <name> <url> [--method GET]` | Add one HTTP endpoint |
| `list-endpoints` | List endpoint names, methods, and URLs without displaying headers or bodies |
| `test --profile smoke` | Run a one-VU, 10-second test by default |
| `test --profile load --allow-remote` | Run a five-VU, 30-second test by default |
| `compare <baseline.json> <current.json>` | Compare saved reports and warn when workload or targets differ |

Optional test flags: `--vus`, `--duration`, `--allow-local`, `--allow-remote`, and `--output`. VUs are capped at 50. Smoke tests are limited to one VU. This is a conservative initial guardrail, not a guarantee that a target cannot be overloaded.

## Configuration

`k6boost init` creates `k6boost.json`. Example:

```json
{
  "version": 1,
  "endpoints": [
    {
      "name": "health",
      "url": "https://your-authorized-host.example/health",
      "method": "GET",
      "headers": {},
      "body": null
    }
  ],
  "thresholds": {
    "p95Ms": 1000,
    "failedRate": 0.01
  }
}
```

Supported methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. Headers can be added directly in the JSON file. For secrets, use an environment-variable reference as the complete header value, such as `"${API_TOKEN}"`, and export `API_TOKEN` before running the test. Do not commit secrets. Reports intentionally omit headers and request bodies.

## Reports and comparisons

Run summaries are saved under `.k6boost/reports/` by default. They contain the workload, target hosts, run timestamp, request count, average and p95 request duration, failed-request rate, and threshold outcome. Files are written with restrictive permissions where the operating system supports them.

Comparisons are useful only when runs are reasonably comparable. k6boost warns when the profile, target hosts, VU count, or duration differs; it cannot automatically control hardware, deployments, network conditions, warm-up, or background traffic. Review those factors before treating a change as a regression.

## Security notes

- Run load tests only against systems you own or are explicitly authorized to test.
- The CLI requires an explicit opt-in flag for remote and local/private targets.
- k6 is spawned with an argument array and `shell: false`; user input is not concatenated into a shell command.
- URLs containing embedded credentials are rejected.
- Environment-backed header values are resolved at runtime and are not copied into reports.
- Test scripts and reports may contain operational details. Review them before sharing.
- Target validation is a safety guard, not a network sandbox. It does not eliminate DNS rebinding or every possible private-network address form.

## Development and verification

```bash
npm run typecheck
npm test
npm run build
```

Tests cover target opt-ins, environment-backed headers, report normalization, and threshold evaluation. CI runs type-checking, tests, and the build. A real k6 integration run should be performed against an authorized test service before using this tool for important workloads.

## Current limitations

- One independent HTTP request per configured endpoint on each virtual-user iteration; no chained workflows yet.
- No OpenAPI import, interactive endpoint editor, Docker runner, or trend visualization yet.
- Baseline comparison is a simple summary comparison, not a statistical significance test.
- The CLI depends on a separate Grafana k6 installation.

## License

MIT. See [LICENSE](LICENSE).
