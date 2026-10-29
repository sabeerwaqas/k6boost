# k6boost

TypeScript CLI for API performance testing with [Grafana k6](https://grafana.com/docs/k6/latest/). Simple, repeatable, and production-ready.

**Status:** v0.2.0 stable for production use.

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

# Run test
k6boost test --profile smoke --allow-remote

# View report
cat .k6boost/reports/*.json | jq .
```

## Features

- Test any HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- JSON request bodies with validation
- Custom headers and authentication
- Two test profiles: smoke (1 VU, 10s) and load (5 VU, 30s)
- Performance reports (latency, status codes, failure rates)
- Regression detection via report comparison
- Safe by default (explicit auth required for remote/local targets)
- Interactive CLI or command-line mode

## Usage

### Interactive Mode
For an interactive experience, run with no arguments:
```bash
k6boost
```

This opens a menu to create endpoints, run tests, and view reports.

### Command-Line Mode

#### Add an endpoint
```bash
k6boost add-endpoint <name> --url <url> [options]
```

**Examples:**
```bash
# Simple GET
k6boost add-endpoint health-check --url https://api.example.com/health --method GET

# POST with body
k6boost add-endpoint create-user --url https://api.example.com/users \
  --method POST \
  --header "Content-Type: application/json" \
  --body '{"name":"Test","email":"test@example.com"}'

# With authentication
k6boost add-endpoint protected-api --url https://api.example.com/data \
  --method GET \
  --header "Authorization: Bearer ${API_TOKEN}"
```

**Options:**
| Option | Description |
|--------|-------------|
| `--url <url>` | HTTP/HTTPS URL *(required)* |
| `--method <method>` | HTTP method (default: GET) |
| `--header <key:value>` | HTTP header (repeatable) |
| `--body <body>` | Request body |

#### List endpoints
```bash
k6boost list-endpoints
```

#### Run a test
```bash
k6boost test --profile <smoke|load> [options]
```

**Examples:**
```bash
k6boost test --profile smoke --allow-remote
k6boost test --profile load --vus 10 --duration 1m --allow-remote
```

**Options:**
| Option | Description |
|--------|-------------|
| `--profile <smoke\|load>` | Test profile *(required)* |
| `--vus <count>` | Virtual users (1-50) |
| `--duration <time>` | Duration (e.g., 10s, 1m) |
| `--allow-remote` | Allow testing remote hosts |
| `--allow-local` | Allow testing localhost/private IPs |
| `--output <path>` | Save report to custom path |

#### Compare reports
```bash
k6boost compare baseline.json current.json
```

## Configuration

### k6boost.json
```json
{
  "version": 1,
  "endpoints": [
    {
      "name": "endpoint-name",
      "url": "https://api.example.com/endpoint",
      "method": "POST",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer ${API_TOKEN}"
      },
      "body": "{\"key\":\"value\"}",
      "bodyType": "json"
    }
  ],
  "thresholds": {
    "p95Ms": 1000,      // 95th percentile latency threshold
    "failedRate": 0.01  // Failure rate threshold (1%)
  }
}
```

### Thresholds
Tests pass when:
- `p95Ms ≤ threshold` AND `failedRate ≤ threshold`

### Secrets Management
Never commit secrets. Use environment variables:

```bash
# Add endpoint with reference
k6boost add-endpoint api --url https://api.example.com \
  --header "Authorization: Bearer ${API_TOKEN}"

# Set at runtime
export API_TOKEN="your-secret"
k6boost test --profile smoke --allow-remote
```

✓ Secrets are **not** saved to config, scripts, or reports  
✓ Resolved at runtime only

## Reports

Reports are saved to `.k6boost/reports/` with timestamp filenames. View with:
```bash
cat .k6boost/reports/*.json | jq .
```

**Report includes:**
- Request count and latency metrics (avg, p95)
- HTTP status distribution
- Failure rate and threshold results

Example output:
```
Requests: 528 | p95: 312 ms | failed: 2.84%
```

## Security

- Tests require explicit flags (`--allow-remote`, `--allow-local`)
- Never commit secrets—use environment variables instead
- Secrets are resolved at runtime only, not saved to config or reports
- TLS verification is always enabled
- k6boost uses Grafana k6's secure defaults

**Best practices:**
1. Only test APIs you own or are authorized to test
2. Use environment variables for sensitive data
3. Review reports before sharing (may contain operational details)

## Examples

### Test a public API
```bash
k6boost init
k6boost add-endpoint httpbin --url https://httpbin.org/get
k6boost test --profile smoke --allow-remote
```

### Test with authentication
```bash
export API_TOKEN="your-token"
k6boost add-endpoint api --url https://api.example.com/data \
  --header "Authorization: Bearer ${API_TOKEN}"
k6boost test --profile smoke --allow-remote
```

### Test multiple endpoints
```bash
k6boost add-endpoint health --url https://api.example.com/health
k6boost add-endpoint search --url https://api.example.com/search --method POST \
  --body '{"query":"test"}'
k6boost test --profile load --allow-remote
```

### Regression testing
```bash
k6boost test --profile smoke --allow-remote --output baseline.json
# Make API changes...
k6boost test --profile smoke --allow-remote --output current.json
k6boost compare baseline.json current.json
```

## Development

```bash
npm install
npm run build      # Compile TypeScript
npm test           # Run tests
npm run typecheck  # Check types
```

## Limitations

- No chained request workflows (single request per endpoint per iteration)
- No OpenAPI/Swagger import
- Requires separate Grafana k6 installation

## CI/CD

The CLI works in non-interactive environments (pipes, CI/CD):

```bash
#!/bin/bash
export API_TOKEN="$CI_API_TOKEN"
k6boost init
k6boost add-endpoint health --url https://api.staging.example.com/health
k6boost test --profile smoke --allow-remote || exit 1
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| `k6` not found | Install k6: `brew install k6` or see [k6 docs](https://grafana.com/docs/k6/latest/get-started/installation/) |
| Remote host not allowed | Use `--allow-remote` flag |
| Environment variable not set | Export before running: `export API_TOKEN="value"` |
| Invalid JSON body | Validate with: `echo '...' \| jq .` |

## License

MIT. See [LICENSE](LICENSE).

## Resources

- [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/)
- [HTTP Performance Testing Best Practices](https://grafana.com/docs/k6/latest/testing-guides/)
- [GitHub Repository](https://github.com/sabeerwaqas/k6boost)
