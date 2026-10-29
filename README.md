# k6boost

A safety-conscious TypeScript CLI for repeatable API performance tests powered by [Grafana k6](https://grafana.com/docs/k6/latest/). k6boost is a workflow wrapper that makes performance testing simple, repeatable, and safe.

> **Status:** v0.2.0 ready for production use. Early adopters encouraged; APIs stable.

---

## ✨ Features

- **Simple API testing** — Test GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS endpoints
- **JSON request bodies** — Send structured data with validation
- **Custom headers** — Full control over HTTP headers
- **Secure authentication** — Environment variables for secrets (never stored in config)
- **Multiple test profiles** — Smoke tests (1 VU, 10s) and load tests (5 VU, 30s)
- **Performance reporting** — Track latency, status codes, and failure rates
- **Regression detection** — Compare test runs to find performance issues
- **Safe by default** — Explicit authorization required for remote/local targets

---

## 📋 Requirements

- **Node.js 20+**
- **Grafana k6** ([install guide](https://grafana.com/docs/k6/latest/get-started/installation/))
- **npm** (usually included with Node.js)

### Verify Installation

```bash
node --version     # Should be 20+
k6 version         # Should show k6 version
npm --version      # Should show npm version
```

---

## 🚀 Quick Start (5 minutes)

### 1. Install k6boost

```bash
# Clone the repository
git clone https://github.com/sabeerwaqas/k6boost.git
cd k6boost

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link globally (optional)
npm link
```

**Using directly without npm link:**
```bash
node dist/index.js <command>
```

**Or create an alias for convenience:**
```bash
alias k6boost="node /path/to/k6boost/dist/index.js"
```

### 2. Initialize a Test Project

```bash
mkdir my-api-tests
cd my-api-tests
k6boost init
```

This creates `k6boost.json`:
```json
{
  "version": 1,
  "endpoints": [],
  "thresholds": {
    "p95Ms": 1000,
    "failedRate": 0.01
  }
}
```

### 3. Add an Endpoint

```bash
k6boost add-endpoint health \
  --url https://httpbin.org/status/200 \
  --method GET
```

### 4. Run a Test

```bash
k6boost test --profile smoke --allow-remote
```

**Output:**
```
running (10.5s), 1/1 VUs, 12 complete and 0 interrupted iterations
Report saved: .k6boost/reports/2026-10-29T15-37-57-394Z.json
Requests: 12 | p95: 307 ms | failed: 0%
```

### 5. View Report

```bash
cat .k6boost/reports/*.json | jq .
```

---

## 📚 Commands Reference

### `k6boost init`
Create a new `k6boost.json` configuration file (won't overwrite existing).

```bash
k6boost init
```

### `k6boost add-endpoint`
Add an HTTP endpoint to test.

**Basic syntax:**
```bash
k6boost add-endpoint <name> --url <url> [options]
```

**Examples:**

Simple GET:
```bash
k6boost add-endpoint health-check --url https://api.example.com/health --method GET
```

POST with JSON body:
```bash
k6boost add-endpoint create-user \
  --url https://api.example.com/users \
  --method POST \
  --header "Content-Type: application/json" \
  --body '{"name":"Test User","email":"test@example.com"}'
```

With authentication:
```bash
k6boost add-endpoint protected-api \
  --url https://api.example.com/data \
  --method GET \
  --header "Authorization: Bearer ${API_TOKEN}"
```

Multiple headers:
```bash
k6boost add-endpoint search \
  --url https://api.example.com/search \
  --method POST \
  --header "Content-Type: application/json" \
  --header "User-Agent: k6boost/1.0" \
  --header "X-Request-ID: test" \
  --body '{"query":"test"}'
```

**Options:**
| Option | Description | Required |
|--------|-------------|----------|
| `--url <url>` | HTTP or HTTPS URL | ✅ Yes |
| `--method <method>` | HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) | Optional (defaults to GET) |
| `--header <key:value>` | HTTP header in `key:value` format (repeatable) | Optional |
| `--body <body>` | Request body (JSON or plain text) | Optional |
| `--body-type <type>` | Body type: `json` or `text` | Optional (auto-detected from Content-Type) |

### `k6boost list-endpoints`
List all configured endpoints.

```bash
k6boost list-endpoints
```

**Output:**
```
Name              Method  URL                              Body
health-check      GET     https://api.example.com/health   -
create-user       POST    https://api.example.com/users    json (45B)
```

### `k6boost test`
Run a performance test.

**Basic syntax:**
```bash
k6boost test --profile <smoke|load> [options]
```

**Examples:**

Smoke test (1 VU, 10s):
```bash
k6boost test --profile smoke --allow-remote
```

Load test (5 VU, 30s):
```bash
k6boost test --profile load --allow-remote
```

Custom configuration:
```bash
k6boost test \
  --profile smoke \
  --vus 10 \
  --duration 1m \
  --allow-remote \
  --output my-report.json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--profile <smoke\|load>` | Test profile (required) |
| `--vus <count>` | Virtual users (1-50, defaults: smoke=1, load=5) |
| `--duration <time>` | Test duration, e.g., `10s`, `1m`, `30m` |
| `--allow-remote` | Required to test remote hosts |
| `--allow-local` | Required to test localhost/private IPs |
| `--output <path>` | Save report to custom path |

### `k6boost compare`
Compare two test reports to detect regressions.

```bash
k6boost compare baseline.json current.json
```

**Output:**
```
Baseline: 2026-10-29T15:37:57.396Z (baseline-run)
Current:  2026-10-29T15:38:41.220Z (current-run)

Metric              Baseline    Current     Change
Requests            36          528         1366.67%
Average latency     277.39 ms   285.75 ms   3.01%
  Regression
p95 latency         307.37 ms   312.13 ms   1.55%
  Regression
Failed rate (%)     0           2.84%       n/a
  Regression

Thresholds: baseline PASS; current FAIL
```

---

## ⚙️ Configuration

### k6boost.json Structure

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
    "p95Ms": 1000,      // 95% of requests must complete within 1000ms
    "failedRate": 0.01  // Failure rate must be < 1%
  }
}
```

### Endpoint Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | ✅ Yes | Unique endpoint identifier (letters, numbers, dots, underscores, hyphens) |
| `url` | string | ✅ Yes | HTTP or HTTPS URL |
| `method` | string | Optional | HTTP method (defaults to GET) |
| `headers` | object | Optional | HTTP headers as key-value pairs |
| `body` | string | Optional | Request body (JSON or plain text) |
| `bodyType` | string | Optional | `json` or `text` (auto-detected from Content-Type header) |

### Thresholds

Define performance targets for your tests:

```json
{
  "thresholds": {
    "p95Ms": 500,       // Stricter: 95% of requests < 500ms
    "failedRate": 0.005 // Stricter: max 0.5% failures
  }
}
```

Test **PASSES** if:
- `p95Ms ≤ threshold` AND `failedRate ≤ threshold`

Test **FAILS** if:
- `p95Ms > threshold` OR `failedRate > threshold`

---

## 🔐 Using Environment Variables for Secrets

Never commit API tokens or passwords to `k6boost.json`. Use environment variable references instead:

### 1. Define the Endpoint with a Reference

```bash
k6boost add-endpoint my-api \
  --url https://api.example.com/data \
  --method GET \
  --header "Authorization: Bearer ${MY_API_TOKEN}"
```

This saves in `k6boost.json`:
```json
{
  "headers": {
    "Authorization": "Bearer ${MY_API_TOKEN}"
  }
}
```

### 2. Set the Variable Before Running Tests

```bash
export MY_API_TOKEN="your-secret-token-here"
k6boost test --profile smoke --allow-remote
```

### Security Guarantees

✅ Token is NOT saved in `k6boost.json`  
✅ Token is NOT written to generated k6 scripts  
✅ Token is NOT included in saved reports  
✅ Token is only resolved at runtime

---

## 📊 Understanding Test Results

### Console Output

```
Requests: 528 | p95: 312 ms | failed: 2.84%
```

- **Requests:** Total HTTP requests made during test
- **p95:** 95th percentile response time (95% of requests were faster)
- **failed:** Percentage of requests that failed

### Saved Reports

Reports are saved to `.k6boost/reports/` with timestamp names:

```bash
.k6boost/reports/
├── 2026-10-29T15-37-57-394Z.json  (smoke test)
└── 2026-10-29T15-38-41-219Z.json  (load test)
```

**Report structure:**
```json
{
  "schemaVersion": 1,
  "id": "2026-10-29T15-37-57-394Z",
  "createdAt": "2026-10-29T15:37:57.396Z",
  "profile": "smoke",
  "targetHosts": ["api.example.com"],
  "workload": {
    "vus": 1,
    "duration": "10s"
  },
  "thresholds": {
    "p95Ms": 1000,
    "failedRate": 0.01
  },
  "metrics": {
    "requestCount": 23,
    "failedRate": 0,
    "avgMs": 444,
    "p95Ms": 761,
    "httpStatusDistribution": {
      "200": 23
    }
  },
  "thresholdsPassed": true
}
```

### HTTP Status Distribution

Reports include a breakdown of HTTP status codes:

```json
"httpStatusDistribution": {
  "200": 450,  // Successful
  "201": 50,   // Created
  "400": 10,   // Client errors
  "500": 5     // Server errors
}
```

This helps you distinguish:
- ✅ **200–299:** Successful responses
- ❌ **400–499:** Client errors (validation failed, not found, etc.)
- 🔥 **500–599:** Server errors (API crashed or returned error)

---

## 🔒 Security

### Authorization Flags

k6boost requires **explicit authorization** to test remote and local targets:

```bash
# ❌ This will fail
k6boost test --profile smoke

# ✅ This requires --allow-remote for remote hosts
k6boost test --profile smoke --allow-remote

# ✅ This requires --allow-local for localhost/private IPs
k6boost test --profile smoke --allow-local
```

### Best Practices

1. **Only test APIs you own or are authorized to test**
   - Getting permission before running load tests on production APIs

2. **Never commit secrets**
   ```bash
   # ❌ Bad
   "Authorization": "Bearer sk_live_abc123def456"

   # ✅ Good
   "Authorization": "Bearer ${API_TOKEN}"
   ```

3. **Use environment variables for sensitive data**
   ```bash
   export API_TOKEN="your-secret"
   export API_KEY="your-key"
   k6boost test --profile smoke --allow-remote
   ```

4. **Review reports before sharing**
   - Reports may contain operational details or request patterns

5. **Don't disable TLS verification**
   - k6boost uses k6's default TLS validation (secure by default)

---

## 📝 Examples

### Example 1: Test Public API

```bash
k6boost init
k6boost add-endpoint httpbin --url https://httpbin.org/get --method GET
k6boost list-endpoints
k6boost test --profile smoke --allow-remote
```

### Example 2: Test Protected API

```bash
export API_TOKEN="your-token-here"

k6boost add-endpoint api \
  --url https://your-api.com/data \
  --method GET \
  --header "Authorization: Bearer ${API_TOKEN}"

k6boost test --profile smoke --allow-remote
```

### Example 3: Test User Creation (POST)

```bash
k6boost add-endpoint create-user \
  --url https://api.example.com/users \
  --method POST \
  --header "Content-Type: application/json" \
  --body '{"name":"Performance Tester","email":"perf@example.com","role":"tester"}'

k6boost test --profile load --allow-remote
```

### Example 4: Test Multiple Endpoints

```bash
# Health check
k6boost add-endpoint health \
  --url https://api.example.com/health \
  --method GET

# Search
k6boost add-endpoint search \
  --url https://api.example.com/search \
  --method POST \
  --header "Content-Type: application/json" \
  --body '{"query":"test","limit":20}'

# List
k6boost add-endpoint list-users \
  --url https://api.example.com/users \
  --method GET

# Run test (all 3 endpoints tested)
k6boost test --profile load --allow-remote
```

### Example 5: Regression Testing

```bash
# Save baseline
k6boost test --profile smoke --allow-remote --output baseline.json

# Make changes to API...

# Run new test
k6boost test --profile smoke --allow-remote --output current.json

# Compare
k6boost compare baseline.json current.json
```

---

## 🧪 Development

### Setup

```bash
npm install
npm run build
npm test
npm run typecheck
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev -- <cmd>` | Run command without building (development) |
| `npm test` | Run unit tests |
| `npm test:watch` | Run tests in watch mode |
| `npm run typecheck` | Check TypeScript types without building |

### Running Tests

```bash
# Unit tests
npm test

# All checks (type-check, build, test)
npm run build && npm test
```

---

## 📋 Limitations

- One independent HTTP request per endpoint per VU iteration (no chained workflows yet)
- No OpenAPI/Swagger import yet
- No interactive endpoint editor yet
- No Docker runner yet
- Baseline comparison is summary-based, not statistically rigorous
- Requires separate Grafana k6 installation

---

## 🔄 Troubleshooting

### "Unable to start k6"
**Problem:** k6 is not installed or not on PATH

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install k6

# macOS
brew install k6

# Verify
k6 version
```

### "Endpoint targets a remote host. Re-run with --allow-remote"
**Problem:** You didn't authorize remote hosts

**Solution:**
```bash
k6boost test --profile smoke --allow-remote
```

### "Environment variable API_TOKEN required by endpoint is not set"
**Problem:** You referenced an environment variable but didn't set it

**Solution:**
```bash
export API_TOKEN="your-token"
k6boost test --profile smoke --allow-remote
```

### "body must be valid JSON when bodyType is 'json'"
**Problem:** Invalid JSON in request body

**Solution:** Validate JSON before adding endpoint
```bash
echo '{"key":"value"}' | jq .
```

### "High failure rate in test results"
**Problem:** Many requests failed

**Solution:** Check:
1. Is the endpoint returning 4xx/5xx status codes?
2. Is the endpoint accessible/up?
3. Are you using correct authentication?
4. Is the API overloaded?

---

## 📄 License

MIT. See [LICENSE](LICENSE).

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

---

## 📖 Learn More

- [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/)
- [HTTP Performance Testing Best Practices](https://grafana.com/docs/k6/latest/testing-guides/)
- [k6boost GitHub](https://github.com/sabeerwaqas/k6boost)
