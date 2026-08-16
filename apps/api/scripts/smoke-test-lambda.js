/**
 * Boots the packaged Lambda bundle and serves a real request through it.
 *
 * This is the end-to-end guard for the exact failure class that caused the
 * production outage: it loads bundle/lambda.js (no node_modules needed),
 * cold-starts the NestJS app, and asserts a real HTTP response from
 * /api/health. If decorator metadata was lost in bundling, DI would throw at
 * boot; if the bundle were broken, require would throw — both fail this script.
 *
 * The app boots in degraded mode when CognoDB is unreachable, so this test
 * does not require database credentials.
 */
const path = require('path');

const API_DIR = path.resolve(__dirname, '..');
const bundlePath = path.join(API_DIR, 'bundle', 'lambda.js');

const MOCK_EVENT = {
  version: '2.0',
  routeKey: 'ANY /{proxy+}',
  rawPath: '/api/health',
  rawQueryString: '',
  headers: { host: 'localhost', accept: 'application/json' },
  requestContext: {
    accountId: 'smoke',
    apiId: 'smoke',
    domainName: 'localhost',
    domainPrefix: 'smoke',
    http: {
      method: 'GET',
      path: '/api/health',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'smoke-test',
    },
    requestId: 'smoke',
    routeKey: 'ANY /{proxy+}',
    stage: '$default',
    time: new Date().toISOString(),
    timeEpoch: Date.now(),
  },
  isBase64Encoded: false,
};

async function main() {
  const { handler } = require(bundlePath);

  // Node 24 Lambda rejects callback-based handlers, so invoke promise-style
  // with exactly (event, context).
  const result = await handler(MOCK_EVENT, {});
  const status = result?.statusCode ?? -1;
  const body = typeof result?.body === 'string' ? result.body : JSON.stringify(result?.body);

  if (status !== 200) {
    console.error(`✗ Smoke test failed — /api/health returned ${status}: ${body}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error(`✗ Smoke test failed — /api/health body is not JSON: ${body}`);
    process.exit(1);
  }

  if (parsed.status !== 'ok') {
    console.error(`✗ Smoke test failed — unexpected health payload: ${body}`);
    process.exit(1);
  }

  console.log(`✓ Lambda bundle boots and serves HTTP — /api/health → ${status} ${JSON.stringify(parsed)}`);
}

main().catch((err) => {
  console.error('✗ Smoke test failed:', err);
  process.exit(1);
});
