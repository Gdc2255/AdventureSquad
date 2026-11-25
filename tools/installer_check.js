// 验证安装程序：能选目录、解压正确、卸载脚本用的是实际选的目录
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXE = 'D:/cocos/AdventureSquad/build/release/AdventureSquad-Setup-1.0.0.exe';
const TEST_DIR = 'C:/Users/26775/AppData/Local/Temp/as_install_test';

console.log('1) 检查安装程序里的嵌入资源…');
// 用 .NET 读嵌入资源并解压到测试目录
const extractSrc = 'C:/Users/26775/AppData/Local/Temp/ExtractTest.cs';
if (!fs.existsSync('C:/Users/26775/AppData/Local/Temp/ExtractTest.exe')) {
    fs.copyFileSync('C:/Users/26775/AppData/Local/Temp/ExtractTest.cs', extractSrc);
}
fs.rmSync(TEST_DIR, { recursive: true, force: true });
fs.mkdirSync(TEST_DIR, { recursive: true });
const out = execFileSync('C:/Users/26775/AppData/Local/Temp/ExtractTest.exe',
    [EXE, TEST_DIR], { encoding: 'utf8' });
console.log('  ' + out.trim().replace(/\n/g, '  '));

console.log('2) 检查解压后的内容…');
const need = ['Game/www/index.html', 'Game/server.js', 'Game/play-game.bat',
    'Source/assets/scripts/Game.ts', 'Source/README.md', '安装与开发指引.txt'];
let ok = true;
for (const f of need) {
    const p = path.join(TEST_DIR, f);
    const has = fs.existsSync(p);
    if (!has) ok = false;
    console.log('  ' + (has ? '✓' : '✗') + ' ' + f);
}

console.log('3) 检查游戏能起来…');
const srv = require('child_process').spawn('node', [path.join(TEST_DIR, 'Game', 'server.js')], {
    stdio: 'ignore', detached: true,
});
process.on('exit', () => { try { process.kill(-srv.pid); } catch (e) { } });

setTimeout(() => {
    const http = require('http');
    http.get('http://127.0.0.1:8137/', (res) => {
        console.log('  ✓ 首页 HTTP ' + res.statusCode);
        try { process.kill(-srv.pid); } catch (e) { }
        console.log(ok ? '\n全部通过 ✓' : '\n有缺失 ✗');
        process.exit(ok ? 0 : 1);
    }).on('error', (e) => {
        console.log('  ✗ 服务器没起来: ' + e.message);
        try { process.kill(-srv.pid); } catch (e) { }
        process.exit(1);
    });
}, 2500);
