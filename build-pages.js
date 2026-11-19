/**
 * 生成 GitHub Pages 用的静态站点到 docs/
 *
 * 本地预览靠 serve.js 动态出模块清单、按目录分两处托管；Pages 是纯静态，
 * 所以这里把「页面 + 预览层 + 模块清单 + 游戏源码 + 素材」摊平到同一个目录，
 * 部署在 https://<user>.github.io/classic-pool-minigame/ 这种子路径下。
 *
 * 路径适配：
 *   - index.html 用相对路径引 wx-shim.js / boot.js
 *   - boot.js 从自己的 src 反推站点根，模块 id 仍是 /src/x.js，请求时加前缀
 *   - 素材用相对路径（pkgAssets/...），由 index.html 所在目录解析
 *
 * 运行：node build-pages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const GAME_DIR = path.join(ROOT, 'classic-pool-minigame');
const PREVIEW_DIR = path.join(ROOT, 'web-preview');
const OUT = path.join(ROOT, 'docs');

function rmrf(p) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
    }
}

// 与 serve.js 的 buildManifest 保持一致：/game.js + /src 下所有 .js（跳过 pkgAssets）
function buildManifest() {
    const modules = [];
    function walk(dir, prefix) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules') continue;
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

console.log('[1/3] 准备 docs/');
// 只清理构建产物，保留仓库里已有的 docs/screenshot.png
const KEEP = new Set(['screenshot.png']);
fs.mkdirSync(OUT, { recursive: true });
for (const name of fs.readdirSync(OUT)) {
    if (!KEEP.has(name)) rmrf(path.join(OUT, name));
}

console.log('[2/3] 复制页面、预览层、游戏源码与素材');
for (const f of ['index.html', 'boot.js', 'wx-shim.js']) {
    fs.copyFileSync(path.join(PREVIEW_DIR, f), path.join(OUT, f));
}
fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });

const manifest = buildManifest();
fs.writeFileSync(path.join(OUT, 'preview', 'manifest.json'), JSON.stringify(manifest, null, 2));

fs.copyFileSync(path.join(GAME_DIR, 'game.js'), path.join(OUT, 'game.js'));
copyDir(path.join(GAME_DIR, 'src'), path.join(OUT, 'src'));
copyDir(path.join(GAME_DIR, 'pkgAssets'), path.join(OUT, 'pkgAssets'));

// 小游戏里 src/ 下的备份文件不该上线
(function pruneBak(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pruneBak(full);
        else if (/\.bak/.test(entry.name)) fs.rmSync(full);
    }
})(path.join(OUT, 'src'));

// Pages 默认会给 404 一个页面；单页应用回退到 index
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('[3/3] 完成');
console.log('  模块数：' + manifest.modules.length);
let bytes = 0, files = 0;
(function size(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) size(full);
        else { bytes += fs.statSync(full).size; files++; }
    }
})(OUT);
console.log('  文件数：' + files + '，总体积：' + (bytes / 1024 / 1024).toFixed(1) + 'MB');
console.log('  输出目录：' + OUT);
