# k6boost

TypeScript CLI for professional API performance testing with [Grafana k6](https://grafana.com/docs/k6/latest/). Simple, repeatable, safe, and production-ready.

**Status:** v0.3.0 with extended performance testing profiles.

## Quick Start

### Prerequisites
- Node.js 20+
- [Grafana k6](https://grafana.com/docs/k6/latest/get-started/installation/)

### Installation
```bash
git clone https://github.com/sabeerwaqas/k6boost.git
cd k6boost
npm install && npm run build
npm link  # Or: alias k6boost="node /path/to/dist/index.js"
```

### 5-Minute Setup
```bash
# Initialize project
mkdir my-api-tests && cd my-api-tests
k6boost init

# Add an endpoint
k6boost add-endpoint health --url https://httpbin.org/status/200 --method GET

# Run smoke test (quick health check)
k6boost test --profile smoke --allow-remote

# Run load test (realistic traffic)
k6boost test --profile load --allow-remote

# View report
cat .k6boost/reports/*.json | jq .
```

## Features

### Supported HTTP Methods
- GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- JSON request body validation
- Custom headers and authentication
- Environment variable-backed secrets (never persisted)

### Performance Testing Profiles

| Profile | Use Case | Load | Duration | VUs/Arrival-Rate |
|---------|----------|------|----------|------------------|
| **Smoke** | Quick health check | Minimal | 10s | 1 VU |
| **Load** | Realistic workload | Normal | 30s | 5 VUs |
| **Stress** | Capacity analysis | Progressive increase | 30m max | Custom stages |
| **Spike** | Sudden surge response | Baseline → spike → recovery | 20m max | Custom |
| **Soak** | Degradation detection | Sustained | 2h max | Custom |
| **Breakpoint** | Capacity limits | Progressive with safety | 40m max | Custom stages |
| **Regression** | Baseline comparison | Reuse baseline | Reuse baseline | Reuse baseline |
| **Custom** | User-defined | Configurable | 1h max | Flexible |

### Metrics & Analysis
- Latency percentiles: p90, p95, p99, max
- Request throughput (requests/second)
- HTTP status distribution
- Failed request rate and check pass rate
- Threshold evaluation (pass/fail)
- Regression detection with tolerance thresholds
- Stage-by-stage analysis (stress/breakpoint tests)
- Time-window analysis (soak tests)

### Safety & Security
- Explicit authorization for remote testing (`--allow-remote`)
- Explicit opt-in for local/private targets (`--allow-local`)
- Conservative default load levels
- Configurable safety limits (max VUs, duration, total runtime)
- Secrets resolved at runtime only (never persisted)
- No credentials embedded in URLs
- No automatic retries (prevent load amplification)
- Protected report files (mode 0o600)

### Reporting & Comparison
- Structured JSON reports with versioning
- Historical baseline comparison
- Regression detection with configurable tolerances
- Backward compatible with v1 reports
- Readable terminal output with status indicators

## Profiles & Use Cases

### Smoke Test
Quick health check with minimal load.
```bash
k6boost test --profile smoke --allow-remote
```
**Default:** 1 VU, 10 seconds  
**When to use:** Pre-deployment checks, CI/CD health gates, quick validation

### Load Test
Measures performance under expected normal workload.
```bash
k6boost test --profile load --allow-remote
```
**Default:** 5 VUs, 30 seconds  
**When to use:** Performance baseline, normal traffic simulation, SLA validation

### Stress Test
Determines how performance degrades under increasing load.
```bash
k6boost test --profile stress --vus 10 --max-vus 100 --stage-duration 2m --allow-remote
```
**Configurable:** Start VUs, end VUs, stage duration  
**When to use:** Capacity planning, breaking points, resource limits discovery

### Spike Test
Tests response to sudden, unexpected traffic increases.
```bash
k6boost test --profile spike --vus 5 --max-vus 50 --stage-duration 30s --allow-remote
```
**Stages:** baseline → spike → recovery  
**When to use:** Viral content handling, queue behavior, graceful degradation

### Soak / Endurance Test
Detects degradation during prolonged, sustained load.
```bash
k6boost test --profile soak --vus 10 --duration 2h --allow-remote
```
**Duration:** Up to 2 hours  
**When to use:** Memory leak detection, long-term stability, resource accumulation

### Breakpoint / Capacity Test
Progressively increases load to find the breaking point.
```bash
k6boost test --profile breakpoint --vus 5 --max-vus 100 --stage-duration 2m --allow-remote
```
**Stops at:** First threshold failure or configured limit  
**When to use:** Maximum capacity discovery, SLA boundaries, scaling decisions

### Performance Regression Test
Compares current performance against a saved baseline.
```bash
# Save baseline
k6boost test --profile load --allow-remote --output baseline.json

# Make API changes...

# Test regression
k6boost test --profile regression --baseline baseline.json --tolerance p95=10% failedRate=50% --allow-remote
```
**When to use:** Pre-commit checks, deployment validation, performance regressions

### Custom Scenario
User-defined workload configuration for specialized testing needs.
```bash
k6boost test --profile custom --executor ramping-arrival-rate --arrival-rate 100 --duration 5m --allow-remote
```
**Flexible:** Arrival-rate or VU-based, stages, custom thresholds  
**When to use:** Complex workflows, non-standard load patterns, research

## VUs vs. Arrival Rate

### Virtual Users (VUs)
- Concurrent **connections** making requests in a loop
- Think: "How many users are hitting my API at once?"
- Each VU makes as many requests as possible within the duration
- Good for: Simulating real user concurrency, understanding client behavior
- Predictable request distribution depends on response time

### Arrival Rate (Requests Per Second)
- Fixed **request rate** regardless of response time
- Think: "I want exactly X requests per second, regardless of how long they take"
- k6 will spawn/reduce VUs as needed to maintain the rate
- Good for: Simulating external load, stress testing, request rate limits
- Better for: Consistent load patterns, rate-based SLAs

### When to use each
| Scenario | Use |
|----------|-----|
| "How many concurrent users?" | VUs |
| "Can we handle 1000 req/s?" | Arrival Rate |
| "What's our performance at 50 concurrent users?" | VUs |
| "What happens at peak bandwidth?" | Arrival Rate |
| "Normal user simulation" | VUs |
| "API rate limit testing" | Arrival Rate |

## Thresholds & Percentiles

### Percentiles Explained
- **p90:** 90% of requests are faster than this time
- **p95:** 95% of requests are faster than this time  
- **p99:** 99% of requests are faster than this time
- **max:** Slowest single request

### Examples
```json
{
  "thresholds": {
    "p90Ms": 500,      // 90% of requests should be < 500ms
    "p95Ms": 1000,     // 95% of requests should be < 1000ms
    "p99Ms": 2000,     // 99% of requests should be < 2000ms
    "failedRate": 0.01 // Failed requests should be < 1%
  }
}
```

### Regression Tolerances
Allow specified degradation when comparing against baseline:
```bash
k6boost test --profile regression --baseline baseline.json \
  --tolerance p95=10% p99=15% failedRate=50% --allow-remote
```
- `p95=10%`: Allow 10% slower p95 latency
- `failedRate=50%`: Allow 50% more failures (e.g., 0.5% → 0.75%)

## Safe Examples

### Testing a Public API (httpbin)
```bash
k6boost init
k6boost add-endpoint httpbin --url https://httpbin.org/get --method GET
k6boost test --profile smoke --allow-remote
```

### Testing with Authentication
```bash
export API_TOKEN="your-api-key"
k6boost add-endpoint protected \
  --url https://api.example.com/data \
  --header "Authorization: Bearer ${API_TOKEN}"
k6boost test --profile load --allow-remote
```

### Multiple Endpoints
```bash
k6boost add-endpoint health --url https://api.example.com/health --method GET
k6boost add-endpoint search --url https://api.example.com/search --method POST \
  --body '{"query":"test"}' \
  --header "Content-Type: application/json"
k6boost test --profile load --allow-remote
```

### Saving & Comparing Baselines
```bash
# Establish baseline before changes
k6boost test --profile load --allow-remote --output baseline.json

# Make changes to your API...

# Test again
k6boost test --profile load --allow-remote --output current.json

# Compare
k6boost compare baseline.json current.json
```

### Stress Test With Stages
```bash
# Progressive load: 10 → 50 → 100 VUs in 2-minute stages
k6boost test --profile stress \
  --vus 10 \
  --max-vus 100 \
  --stage-duration 2m \
  --allow-remote
```

### Soak Test
```bash
# Run 30 minutes at constant 20 VUs
k6boost test --profile soak \
  --vus 20 \
  --duration 30m \
  --allow-remote
```

## Configuration

### k6boost.json
```json
{
  "version": 1,
  "endpoints": [
    {
      "name": "list-users",
      "url": "https://api.example.com/users",
      "method": "GET",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-Custom-Header": "value"
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
      "body": "{\"name\":\"Test User\",\"email\":\"test@example.com\"}",
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

### Secrets Management
Never commit secrets. Use environment variables:

```bash
# Define in your environment
export API_TOKEN="secret-key-here"
export DB_PASSWORD="password-here"

# Reference in config with ${VAR_NAME} syntax
# Values are resolved at runtime, never persisted in config or reports
```

✓ Secrets are **never** saved to config, scripts, or reports  
✓ Resolved at runtime only  
✓ Reference format: `"Authorization: Bearer ${API_TOKEN}"`

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Performance Tests

on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g k6boost
      - run: k6 --version  # Verify k6 is installed
      - run: |
          k6boost init
          k6boost add-endpoint health --url https://staging-api.example.com/health
          k6boost test --profile smoke --allow-remote
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: performance-reports
          path: .k6boost/reports/
```

## Reports

Reports are saved to `.k6boost/reports/{timestamp}.json` with protected permissions (0o600).

### Report Contents
- Run ID and timestamp
- Test profile and workload configuration
- Target host(s) and HTTP method
- Latency percentiles (p90, p95, p99, max, average)
- Throughput (requests/second)
- Failure rate and check pass rate
- HTTP status code distribution
- Threshold results and overall outcome

### Viewing Reports
```bash
# View latest report
cat .k6boost/reports/*.json | jq .

# Compare two reports
k6boost compare baseline.json current.json

# Extract specific metrics
cat report.json | jq '.metrics | {requestCount, avgMs, p95Ms, failedRate}'
```

## Limitations

- **No request chaining:** Each endpoint is tested independently per iteration
- **No OpenAPI/Swagger import:** Must add endpoints manually or via CLI
- **No custom JavaScript:** Limited to HTTP endpoint testing
- **Single workload per test:** One set of endpoints per run
- **No built-in dashboarding:** Reports are JSON files only

## Authorization & Responsible Testing

### Best Practices
1. **Only test APIs you own or are explicitly authorized to test**
   - Get written permission before stress testing third-party APIs
   - Respect rate limits and terms of service
   - Test during off-peak hours when possible

2. **Inform your team**
   - Document planned test times and expected load
   - Notify on-call engineers before running high-load tests
   - Have a rollback plan

3. **Start small**
   - Begin with smoke tests to validate test setup
   - Gradually increase load (smoke → load → stress)
   - Monitor infrastructure during testing

4. **Review results**
   - Examine all reports before sharing
   - Redact sensitive operational details if needed
   - Learn from failures

5. **Protect secrets**
   - Never commit API keys or tokens
   - Use environment variables exclusively
   - Never log headers or request bodies in reports

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

Contributions welcome! Please open an issue or submit a pull request.

---

**Made with ❤️ for performance engineers**
