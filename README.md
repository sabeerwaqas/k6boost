# k6boost

A safety-conscious TypeScript CLI for repeatable API performance tests powered by Grafana k6.

> Early development: commands and report formats may change before the first release.

## Principles

- Use the official Grafana k6 engine; do not reimplement load generation.
- Validate configuration before starting a run.
- Spawn k6 with an executable and argument array, never a shell-interpolated command.
- Require explicit confirmation for remote targets and higher-load profiles.
- Redact credentials and sensitive headers from logs and reports.
- Save structured results and compare only compatible runs.

## Planned MVP

- `init`: create a project configuration and sample k6 script.
- `add-endpoint`: register a simple HTTP endpoint.
- `test`: run smoke or load profiles through k6.
- `compare`: compare saved summaries with clear workload/environment warnings.

## Prerequisites

- Node.js 20 or newer.
- Grafana k6 installed and available on `PATH`.

## Development

Development setup and verified commands will be documented as the implementation lands. This project is not yet published to npm.

## Security

Only test systems you own or are explicitly authorized to test. Start with low-intensity smoke tests. Never place secrets in committed configuration files or share reports without reviewing them.

## License

MIT. See `LICENSE`.
