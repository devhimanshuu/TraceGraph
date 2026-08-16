const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Read AWS credentials from .env or ~/.aws/credentials
let accessKeyId = process.env.AWS_ACCESS_KEY_ID;
let secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
let region = process.env.AWS_REGION || 'ap-south-1';

const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.trim().split('=');
    if (k === 'AWS_ACCESS_KEY_ID' && !accessKeyId) accessKeyId = v.join('=').trim();
    if (k === 'AWS_SECRET_ACCESS_KEY' && !secretAccessKey) secretAccessKey = v.join('=').trim();
    if (k === 'AWS_REGION') region = v.join('=').trim();
  }
}

if (!accessKeyId || !secretAccessKey) {
  // Check ~/.aws/credentials
  const credPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.aws', 'credentials');
  if (fs.existsSync(credPath)) {
    const credText = fs.readFileSync(credPath, 'utf8');
    const idMatch = credText.match(/aws_access_key_id\s*=\s*(.+)/i);
    const secMatch = credText.match(/aws_secret_access_key\s*=\s*(.+)/i);
    if (idMatch) accessKeyId = idMatch[1].trim();
    if (secMatch) secretAccessKey = secMatch[1].trim();
  }
}

if (!accessKeyId || !secretAccessKey) {
  console.error('AWS Credentials not found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
  process.exit(1);
}

// AWS SigV4 implementation to fetch CloudWatch Logs
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = sign('AWS4' + key, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

async function getRecentLogs() {
  const logGroupName = '/aws/lambda/tracegraph-api-dev-api';
  const service = 'logs';
  const host = `logs.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;

  // Narrow the window (LOG_MINUTES) and raise the cap (LOG_LIMIT) to get past
  // noisy historical events — e.g. LOG_MINUTES=3 LOG_LIMIT=200 to see just the
  // most recent invocations.
  const minutes = parseInt(process.env.LOG_MINUTES || '30', 10);
  const limit = parseInt(process.env.LOG_LIMIT || '50', 10);
  const payload = JSON.stringify({
    logGroupName: logGroupName,
    limit: limit,
    startTime: Date.now() - minutes * 60 * 1000,
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = '/';
  const canonicalQuery = '';
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:Logs_20140328.FilterLogEvents\n`;
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'Logs_20140328.FilterLogEvents',
          'X-Amz-Date': amzDate,
          'Authorization': authorizationHeader,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            resolve({ raw: data });
          }
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Fetching CloudWatch logs for /aws/lambda/tracegraph-api-dev-api...');
  try {
    const res = await getRecentLogs();
    if (res.events && res.events.length > 0) {
      console.log(`\n=== Found ${res.events.length} Log Events ===\n`);
      for (const ev of res.events) {
        console.log(`[${new Date(ev.timestamp).toLocaleTimeString()}] ${ev.message.trim()}`);
      }
    } else {
      console.log('No recent log events or error:', JSON.stringify(res, null, 2));
    }
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

main();
