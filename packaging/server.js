// AdventureSquad 本地服务器：零依赖（只用 Node 内置模块）
// 用途：游戏的资源是用 resources.load 从文件读的，浏览器的 file:// 协议不让读，
// 所以必须起一个本地 http 服务。启动后会自动打开浏览器。
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'www');
const START_PORT = 8137;
const PORTS = 20;

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.jpg': 'image/jpeg',
    '.bin': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, {
            'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
});

function listen(port, left) {
    server.once('error', () => {
        if (left <= 0) {
            console.log('端口都被占用了，请关掉其它占用 8137 以上的程序再试。');
            process.exit(1);
        }
        listen(port + 1, left - 1);
    });
    // 只监听本机回环地址，不对局域网开放
    server.listen(port, '127.0.0.1', () => {
        const url = `http://localhost:${port}/`;
        console.log('');
        console.log('  AdventureSquad 已启动：' + url);
        console.log('  关闭这个窗口就会停止服务。');
        console.log('');
        openBrowser(url);
    });
}

function openBrowser(url) {
    const cmd = process.platform === 'win32' ? 'start "" "' + url + '"'
        : process.platform === 'darwin' ? 'open "' + url + '"'
        : 'xdg-open "' + url + '"';
    require('child_process').exec(cmd, () => { });
}

if (!fs.existsSync(ROOT)) {
    console.log('找不到游戏目录：' + ROOT);
    process.exit(1);
}
listen(START_PORT, PORTS);
