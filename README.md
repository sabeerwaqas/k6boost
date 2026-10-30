# k6boost

[![npm](https://img.shields.io/npm/v/k6boost.svg?style=flat-square)](https://www.npmjs.com/package/k6boost)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20+-green.svg?style=flat-square)](https://nodejs.org/)
[![CI Status](https://github.com/sabeerwaqas/k6boost/workflows/CI/badge.svg)](https://github.com/sabeerwaqas/k6boost/actions)

**A CLI-first API performance testing tool powered by [Grafana k6](https://grafana.com/docs/k6/latest/).**

k6boost removes friction from API performance testing. Forget writing k6 test scripts—configure endpoints once, select a test profile, and get readable results in seconds. Perfect for backend developers, API teams, and anyone who wants repeatable performance checks without the overhead.

## Table of Contents

- [Why k6boost?](#why-k6boost)
- [How it works](#how-it-works)
- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Supported test profiles](#supported-test-profiles)
- [Understanding performance metrics](#understanding-performance-metrics)
- [Reports and historical comparisons](#reports-and-historical-comparisons)
- [Safety and responsible testing](#safety-and-responsible-testing)
- [Contributing](#contributing)
- [License](#license)

## Why k6boost?

**The Problem:** API performance testing shouldn't require managing test scripts. Developers often face friction:

- Repeatedly writing or maintaining k6 test scripts for different endpoints
- Configuring HTTP methods, headers, request bodies, and authentication for each test
- Converting raw k6 metrics into actionable insights
- Keeping historical test results organized
- Manually comparing current performance against previous baselines

**The Solution:** k6boost is a CLI-first wrapper around Grafana k6 that handles the plumbing. Save your endpoints once, choose a profile that matches your testing need, run the test, review clean results, and compare against history.

**Why CLI-first?**

- **Works in your terminal.** No separate web dashboard required. Part of your natural developer workflow.
- **Fits any environment.** Run locally during development, in CI/CD pipelines, or on your own schedule.
- **Repeatable and scriptable.** Same commands, same results. Easy to version control and document.
- **Fast feedback.** From configuration to test results in seconds, not minutes.

Perfect for backend developers, API teams, performance engineers learning k6, and anyone building production APIs.

## How it works

1. **Install** k6boost (and [Grafana k6](https://grafana.com/docs/k6/latest/get-started/installation/) separately).
2. **Add endpoints** via interactive menu or CLI commands.
3. **Choose a test profile** (smoke, load, stress, spike, soak, breakpoint, or custom).
4. **Run the test** with a single command.
5. **Review results** displayed in a readable table format.
6. **Save and compare** historical reports to track performance over time.

## Features

- **Interactive and CLI modes.** Launch k6boost with no arguments for a guided menu, or use explicit commands for CI/CD pipelines.
- **Flexible HTTP configuration.** GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS with custom headers and request bodies.
- **Environment variable secrets.** Use `${API_TOKEN}` syntax to reference environment variables without storing secrets in config files.
- **Pre-built test profiles.** Smoke, Load, Stress, Spike, Soak, Breakpoint, Regression, and Custom profiles for different testing scenarios.
- **Readable performance metrics.** Average latency, p95, p99, throughput, failure rates, and HTTP status distribution.
- **Historical report storage.** Save test results and compare against baselines to detect performance regressions.
- **Safety by default.** Explicit `--allow-remote` flag, configurable VU caps and duration limits, and secure report storage.
- **CLI-first design.** No external dashboard required. Works within developer workflows and CI/CD systems.

## Installation

### Prerequisites

- **Node.js** 20 or higher
- **Grafana k6** installed and available on your PATH.  
  [Install k6](https://grafana.com/docs/k6/latest/get-started/installation/)

### From npm

```bash
npm install -g k6boost
```

### From source

```bash
git clone https://github.com/sabeerwaqas/k6boost.git
cd k6boost
npm install
npm run build
npm link
```

## Quick start

### 1. Start the interactive menu

Run k6boost with no arguments to launch the guided workflow:

```bash
cd my-api-tests
k6boost
```

You'll see:

```
 _  _ __     _ _        _
| |/ /|  |   | | |      | |
| ' / |  |__ | | | ___  | |__  ___  ___ _ __ 
| . \ |  '_ \| | |/ _ \ | '_ \/ _ \/ _ \ '_ \
| |\ \| |_) | | | (_) || |_) | (_) | (_) | | |
|_| \_\____/|_|_|\___/ |_.__/ \___/\___/|_| |_|

API performance testing, made simple.

→ Main Menu

? What would you like to do?
  ➕  Add a new endpoint
  🚀  Run a performance test
  👁️   View saved endpoints
  📊  Compare test reports
  ⚙️   Settings
  🚪  Exit
```

### 2. Add an endpoint

Select "Add a new endpoint" and enter:

- **Name:** A unique identifier (e.g., "list-users")
- **URL:** The HTTP endpoint (e.g., `https://api.example.com/users`)
- **Method:** GET, POST, PUT, etc.
- **Headers & body:** Optional authentication and request payload

Your endpoint is saved to `k6boost.json`.

### 3. Run a test

Select "Run a performance test" and choose a profile. k6boost runs the test and displays results:

```
----------------------------------------------------------------------
Overall Status                                           PASS
----------------------------------------------------------------------
Test Information
  Profile                                               SMOKE
  Target(s)                                       example.com
  Virtual Users                                             1
  Duration                                                10s
----------------------------------------------------------------------
Request Metrics
  Total Requests                                          100
  Requests/sec                                    10.00 req/s
----------------------------------------------------------------------
Response Time (ms)
  Average                                            50.50 ms
  p95                                                95.50 ms
----------------------------------------------------------------------
Failures
  HTTP Request Failures                      0 failed (0.00%)
----------------------------------------------------------------------
```

### 4. View the report

Results are automatically saved to `.k6boost/reports/{timestamp}.json`:

```bash
cat .k6boost/reports/*.json | jq .
```

---

## Command-line mode (for scripting and CI/CD)

Prefer explicit commands? Use k6boost without the interactive menu:

```bash
# Add an endpoint
k6boost add-endpoint users --url https://api.example.com/users --method GET

# Run a smoke test
k6boost test --profile smoke --allow-remote

# View the report
cat .k6boost/reports/*.json | tail -1 | jq .
```

---

## Supported test profiles

| Profile | Purpose | Example use case |
|---------|---------|------------------|
| **Smoke** | Quick health check | Verify API is reachable before a deployment |
| **Load** | Normal workload | Baseline performance under expected traffic |
| **Stress** | Increasing load | Find performance degradation points |
| **Spike** | Sudden traffic surge | Verify recovery from traffic spikes |
| **Soak** | Sustained load | Detect memory leaks over time |
| **Breakpoint** | Capacity discovery | Find the breaking point of your API |
| **Regression** | Compare against baseline | Detect performance regressions after code changes |
| **Custom** | User-defined | Build your own workload configuration |

Each profile has preconfigured virtual users (VUs), duration, and pass/fail thresholds. Customize as needed.

---

## Understanding performance metrics

After a test completes, k6boost displays key metrics:

| Metric | Meaning | Example |
|--------|---------|---------|
| **Average latency** | Mean response time | 50 ms = typical response time |
| **p95 latency** | 95% of requests faster than this | 95 ms = 95% of requests are ≤95ms |
| **p99 latency** | 99% of requests faster than this | 150 ms = 99% of requests are ≤150ms |
| **Throughput (RPS)** | Requests per second | 100 req/s = API handled 100 requests per second |
| **Failure rate** | Proportion of failed requests | 1% = 1 out of 100 requests failed |
| **HTTP status distribution** | Breakdown of response codes | 2xx, 4xx, 5xx counts |

**Important:** A passing test means your API met the configured thresholds under the simulated load. It does not verify functional correctness, security, or production readiness—only performance characteristics.

---

## Reports and historical comparisons

### View a report

```bash
# Latest report
cat .k6boost/reports/*.json | tail -1 | jq .

# Extract specific metrics
cat report.json | jq '.metrics | {avgMs, p95Ms, failedRate}'
```

### Compare against a baseline

```bash
# Save baseline before code changes
k6boost test --profile load --allow-remote

# Run test after code changes
k6boost test --profile load --allow-remote

# Compare reports
k6boost compare baseline.json current.json
```

Reports are stored with timestamps and include workload configuration, metrics, and threshold results.

---

## Safety and responsible testing

**Before running a performance test:**

1. **Get authorization.** Only test APIs you own or have explicit permission to test.
2. **Inform your team.** Document test times and expected load; notify on-call engineers.
3. **Start small.** Begin with a smoke test, then gradually increase load.
4. **Monitor infrastructure.** Watch system metrics (CPU, memory, network) during tests.
5. **Protect secrets.** Never commit API keys; use environment variables with the `${VARIABLE_NAME}` syntax.

**Safety features:**

- Explicit `--allow-remote` flag required for non-localhost endpoints.
- Configurable duration and VU limits to prevent runaway tests.
- Environment variable substitution keeps secrets out of config files.
- Restricted report file permissions.

**Respect third-party services.** If testing external APIs, respect their rate limits and terms of service. Run tests during off-peak hours when possible.

---

## Configuration

### k6boost.json

Endpoints and thresholds are stored in `k6boost.json`:

```json
{
  "version": 1,
  "endpoints": [
    {
      "name": "list-users",
      "url": "https://api.example.com/users",
      "method": "GET",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  ],
  "thresholds": {
    "p95Ms": 1000,
    "failedRate": 0.01
  }
}
```

### Environment variables

Use `${VARIABLE_NAME}` syntax to reference environment variables at runtime:

```bash
export API_TOKEN="your-secret-key"
k6boost add-endpoint api --url https://api.example.com/data \
  --header "Authorization: Bearer ${API_TOKEN}"
```

Secrets are resolved only when the test runs and are never stored in config files or reports.

---

## Development

```bash
npm install             # Install dependencies
npm run typecheck       # Type check
npm run build           # Compile TypeScript
npm test                # Run test suite
npm run test:watch      # Watch mode
```

---

## Resources

- [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/)
- [k6 Performance Testing Guide](https://grafana.com/docs/k6/latest/testing-guides/)
- [k6 Metrics Reference](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)
- [GitHub Releases](https://github.com/sabeerwaqas/k6boost/releases)

---

## Contributing

Contributions are welcome. To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Make your changes and run tests (`npm test`).
4. Commit with a clear message (`git commit -am 'Add your feature'`).
5. Push to your branch and open a pull request.

The repository uses branch protection to maintain code quality. All pull requests require tests to pass and code review.

---

## License

MIT. See [LICENSE](LICENSE) for details.

---

**Ready to get started?** Install k6boost and run your first performance test in seconds:

```bash
npm install -g k6boost
k6boost
```
