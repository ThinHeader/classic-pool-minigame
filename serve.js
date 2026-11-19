/**
 * 本地预览服务器（仅开发用，零依赖）
 *
 * 为什么需要它：小游戏代码里用相对路径引用资源（pkgAssets/assets/...），
 * 而预览页在 web-preview/ 目录下，两者不同级。这个服务器把两个目录拼到同一个 origin：
 *   /                  -> web-preview/index.html
 *   /preview/*         -> web-preview/*
 *   /preview/manifest.json -> 扫描小游戏目录生成的模块清单
 *   其余路径            -> classic-pool-minigame/*（含 pkgAssets 素材、src 源码）
 *
 * 启动：node serve.js  （默认 http://localhost:5180）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const GAME_DIR = path.join(ROOT, 'classic-pool-minigame');
const PREVIEW_DIR = path.join(ROOT, 'web-preview');
const PORT = Number(process.env.PORT || 5180);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.css': 'text/css; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.ico': 'image/x-icon'
};

// 扫描小游戏目录，生成需要预加载的模块清单
function buildManifest() {
    const modules = [];

    function walk(dir, prefix) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'pkgAssets' || entry.name === 'node_modules') continue;
                walk(full, prefix + '/' + entry.name);
            } else if (entry.name.endsWith('.js')) {
                modules.push(prefix + '/' + entry.name);
            }
        }
    }

    if (fs.existsSync(path.join(GAME_DIR, 'game.js'))) modules.push('/game.js');
    if (fs.existsSync(path.join(GAME_DIR, 'src'))) walk(path.join(GAME_DIR, 'src'), '/src');

    return { modules: modules.sort() };
}

function sendFile(res, filePath, req) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + filePath);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const headers = {
            'Content-Type': type,
            'Cache-Control': 'no-store',
            'Accept-Ranges': 'bytes'
        };

        // 音频（8.7MB 的 mp3）支持 Range，浏览器才能边下边播 / 拖动进度
        const range = req.headers.range;
        if (range && /^bytes=\d*-\d*$/.test(range)) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parts[0] ? parseInt(parts[0], 10) : 0;
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            if (start >= stat.size || end >= stat.size) {
                res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
                res.end();
                return;
            }
            res.writeHead(206, Object.assign({}, headers, {
                'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
                'Content-Length': end - start + 1
            }));
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }

        headers['Content-Length'] = stat.size;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url);
    let pathname = decodeURIComponent(parsed.pathname || '/');

    // 预览页入口
    if (pathname === '/' || pathname === '/index.html') {
        sendFile(res, path.join(PREVIEW_DIR, 'index.html'), req);
        return;
    }

    // 预览自身的静态文件
    if (pathname === '/preview/manifest.json') {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify(buildManifest()));
        return;
    }

    if (pathname.startsWith('/preview/')) {
        const rel = pathname.slice('/preview/'.length);
        const filePath = path.join(PREVIEW_DIR, rel);
        if (!filePath.startsWith(PREVIEW_DIR)) {
            res.writeHead(403);
            res.end('403');
            return;
        }
        sendFile(res, filePath, req);
        return;
    }

    // 其余全部交给小游戏目录（src 源码 + pkgAssets 素材）
    const filePath = path.join(GAME_DIR, pathname);
    if (!filePath.startsWith(GAME_DIR)) {
        res.writeHead(403);
        res.end('403');
        return;
    }
    sendFile(res, filePath, req);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('台球小游戏本地预览已启动：');
    console.log('  http://localhost:' + PORT + '/');
    console.log('  游戏目录：' + GAME_DIR);
    console.log('  联机服务需另开：cd pool-server && npm start （ws://127.0.0.1:3010/pool）');
});
