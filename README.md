# k6boost

A CLI tool for API performance testing that wraps [Grafana k6](https://grafana.com/docs/k6/latest/). Configure endpoints, run tests using different load profiles, and compare results.

## Prerequisites

- **Node.js** 20 or higher
- **Grafana k6** installed and available on your PATH. [Install k6](https://grafana.com/docs/k6/latest/get-started/installation/)

## Installation

From npm (when published):
```bash
npm install -g k6boost
```

From source:
```bash
git clone https://github.com/sabeerwaqas/k6boost.git
cd k6boost
npm install
npm run build
npm link
```

## Quick Start

Initialize a new k6boost project:
```bash
mkdir my-api-tests && cd my-api-tests
k6boost
```

This launches the interactive menu. You can also use commands:

```bash
# Add an endpoint to test
k6boost add-endpoint health --url https://httpbin.org/status/200 --method GET

# Run a smoke test (1 VU, 10 seconds)
k6boost test --profile smoke --allow-remote

# View the report
cat .k6boost/reports/*.json | jq .
```

After the test completes, results are saved to `.k6boost/reports/{timestamp}.json`.

## Features

### HTTP Methods & Flexibility
- **Methods:** GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Request bodies:** JSON or plain text
- **Custom headers:** Set any header, reference environment variables
- **Authentication:** Headers with environment variable substitution (e.g., `Authorization: Bearer ${API_TOKEN}`)

### Test Profiles
Choose the right profile for your testing need:

| Profile | Purpose | Default load | Max duration |
|---------|---------|-----------------|--------------|
| **Smoke** | Quick health check | 1 VU, 10s | 1 minute |
| **Load** | Normal workload simulation | 5 VUs, 30s | 10 minutes |
| **Stress** | Capacity under increasing load | Configurable stages | 30 minutes |
| **Spike** | Response to sudden traffic surge | Configurable stages | 20 minutes |
| **Soak** | Degradation over sustained load | Configurable VU | 2 hours |
| **Breakpoint** | Find capacity limits | Configurable stages | 40 minutes |
| **Regression** | Compare against baseline | Reuse baseline config | Reuse baseline |
| **Custom** | User-defined workload | Configurable | 1 hour |

### Metrics Reported
- **Latency:** average, p95, p99, maximum
- **Throughput:** requests per second
- **Errors:** failed request rate, HTTP status codes
- **Thresholds:** pass/fail evaluation
- **Stages:** per-stage breakdown for ramping tests
- **Regression:** comparison against baseline with configurable tolerance

### Security & Responsible Testing
- Explicit `--allow-remote` flag required for non-localhost targets
- Environment variable secrets (never stored in config files)
- Report files saved with restricted permissions
- Safety limits (configurable max VUs, duration, total runtime)

## Understanding Results

After a test completes, k6boost displays a summary table and saves a JSON report. Key metrics:

| Metric | Meaning |
|--------|---------|
| **Average latency** | Mean response time in milliseconds |
| **p95 latency** | 95% of requests are faster than this time |
| **p99 latency** | 99% of requests are faster than this time |
| **Throughput (RPS)** | Requests completed per second |
| **Failed rate** | Proportion of failed HTTP requests |
| **Status distribution** | Count of 2xx, 4xx, 5xx responses |
| **Thresholds** | Pass/fail result for configured performance limits |

A passing test means the API met all configured thresholds during the test run. It does not verify functional correctness, security, or production readiness—only performance under the specified load.

## Usage Examples

### Add an endpoint
```bash
k6boost add-endpoint users --url https://api.example.com/users --method GET
```

### Add an endpoint with a POST body
```bash
k6boost add-endpoint create-user --url https://api.example.com/users --method POST \
  --header "Content-Type: application/json" \
  --body '{"name":"Test User","email":"test@example.com"}'
```

### Add an endpoint with authentication
```bash
export API_TOKEN="your-api-key"
k6boost add-endpoint protected --url https://api.example.com/data \
  --header "Authorization: Bearer ${API_TOKEN}"
```

### List configured endpoints
```bash
k6boost list-endpoints
```

### Run a smoke test
```bash
k6boost test --profile smoke --allow-remote
```

### Run a load test
```bash
k6boost test --profile load --allow-remote
```

### Run a stress test with stages
```bash
k6boost test --profile stress --vus 10 --max-vus 100 --stage-duration 2m --allow-remote
```

### Save and compare results
```bash
# Save baseline before code changes
k6boost test --profile load --allow-remote --output baseline.json

# Later, compare a new run against the baseline
k6boost test --profile load --allow-remote --output current.json

# View the comparison
k6boost compare baseline.json current.json
```

## Configuration

### k6boost.json
k6boost stores endpoint and threshold configuration in `k6boost.json`:

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
    },
    {
      "name": "create-user",
      "url": "https://api.example.com/users",
      "method": "POST",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer ${API_TOKEN}"
      },
      "body": "{\"name\":\"Test\",\"email\":\"test@example.com\"}",
      "bodyType": "json"
    }
  ],
  "thresholds": {
    "p95Ms": 1000,
    "failedRate": 0.01
  },
  "safetyLimits": {
    "maxVUs": 1000,
    "maxDuration": "1h",
    "maxTotalRuntime": "4h"
  }
}
```

### Environment Variables for Secrets
Never commit secrets. Reference environment variables using `${VARIABLE_NAME}` syntax:

```bash
export API_TOKEN="secret-key"
export DB_PASSWORD="password"
```

Then use them in headers or request bodies:
```bash
k6boost add-endpoint api --url https://api.example.com/data \
  --header "Authorization: Bearer ${API_TOKEN}"
```

Secrets are resolved at runtime only and never stored in config files or reports.

## Reports

Reports are saved to `.k6boost/reports/{timestamp}.json` after each test run.

### What's in a report
- Test profile and workload (VUs, duration, stages)
- Target endpoint(s) and HTTP methods
- Latency percentiles (average, p95, p99, max)
- Request throughput
- Failure rate and HTTP status distribution
- Threshold evaluation result (pass/fail)

### Viewing reports
```bash
# View the latest report
cat .k6boost/reports/*.json | tail -1 | jq .

# Extract specific metrics
cat report.json | jq '.metrics | {requestCount, avgMs, p95Ms, failedRate}'

# Compare two reports
k6boost compare baseline.json current.json
```

### Report format
Reports use semantic versioning (v1 and v2 schemas). Version 2 reports include additional metrics like stage-by-stage breakdowns for ramping tests and time-window analysis for soak tests.

## Limitations

- **No request chaining:** Each endpoint is tested independently in each iteration
- **No OpenAPI/Swagger import:** Manually add endpoints via CLI or config file
- **No custom JavaScript:** Limited to HTTP endpoint testing
- **Single workload per run:** Test one set of endpoints per test execution
- **No built-in dashboards:** View reports as JSON files

## Responsible Testing

Before running a performance test:

1. **Get authorization:** Only test APIs you own or are explicitly permitted to test
2. **Inform your team:** Document test times and expected load; notify on-call engineers
3. **Start small:** Begin with a smoke test, then gradually increase load
4. **Monitor:** Watch infrastructure metrics during higher-load tests
5. **Protect secrets:** Never commit API keys; always use environment variables

If testing a third-party API, respect their terms of service and rate limits. Run tests during off-peak hours when possible.

A passing performance test does not guarantee the API is secure, functionally correct, or ready for production—only that it met the performance thresholds you configured.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `k6 not found` | Install k6: `brew install k6` or see [k6 installation](https://grafana.com/docs/k6/latest/get-started/installation/) |
| Remote host not allowed | Use `--allow-remote` flag to explicitly authorize remote testing |
| Environment variable not set | Export before running: `export API_TOKEN="value"` |
| Invalid JSON body | Validate with: `echo '...' \| jq .` |
| Test duration exceeded | Duration limits: smoke (1m), load (10m), stress (30m), soak (2h) |
| Threshold failure | Check `.k6boost/reports/*.json` for details; adjust thresholds in k6boost.json if needed |

## Development

```bash
npm install          # Install dependencies
npm run typecheck    # Type check only
npm run build        # Compile TypeScript
npm test             # Run test suite
npm run test:watch   # Watch mode
```

## Resources

- [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/)
- [k6 Test Life Cycle](https://grafana.com/docs/k6/latest/using-k6/test-lifecycle/)
- [k6 Executors](https://grafana.com/docs/k6/latest/using-k6/scenarios/)
- [k6 Metrics Reference](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)
- [HTTP Performance Testing Guide](https://grafana.com/docs/k6/latest/testing-guides/)

## License

MIT. See [LICENSE](LICENSE).

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.
