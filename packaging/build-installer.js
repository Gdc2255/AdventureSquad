/**
 * 打包 AdventureSquad 的 Windows 安装程序。
 *
 * 产出两个文件（都放在 build/release/）：
 *   AdventureSquad-Setup-<版本>.exe    WinForms 安装程序（用 .NET Framework 自带的 csc 编译，
 *                                        接收方不需要装任何运行时）
 *   AdventureSquad-<版本>.zip          安装载荷（游戏本体 + 项目源码 + 指引）
 *
 * 装完得到：
 *   %LOCALAPPDATA%\AdventureSquad\Game     游戏本体（双击 play-game.bat 玩）
 *   %LOCALAPPDATA%\AdventureSquad\Source   项目源码（用 Cocos Creator 打开）
 *   桌面快捷方式：AdventureSquad / 卸载 AdventureSquad
 *
 * 用法：node packaging/build-installer.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'build', 'release');
const TREE = path.join(OUT_DIR, '_tree');
const VERSION = require(path.join(ROOT, 'package.json')).version || '1.0.0';
const OUT_EXE = path.join(OUT_DIR, `AdventureSquad-Setup-${VERSION}.exe`);
const OUT_ZIP = path.join(OUT_DIR, `AdventureSquad-${VERSION}.zip`);
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) {
        const s = path.join(src, f);
        const d = path.join(dst, f);
        if (fs.statSync(s).isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}
function copyFile(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

console.log('1/5 组装载荷…');
rmrf(TREE);
const PAYLOAD = path.join(TREE, 'payload');
fs.mkdirSync(PAYLOAD, { recursive: true });

// 游戏本体：构建产物的内层目录才是站点根
const webRoot = path.join(ROOT, 'build', 'web-mobile', 'web-mobile');
if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
    console.error('  没找到构建产物，先构建一次：');
    console.error('  CocosCreator.exe --project <项目路径> --build "platform=web-mobile;buildPath=<项目路径>/build/web-mobile"');
    process.exit(1);
}
copyDir(webRoot, path.join(PAYLOAD, 'Game', 'www'));
copyFile(path.join(__dirname, 'server.js'), path.join(PAYLOAD, 'Game', 'server.js'));
copyFile(path.join(__dirname, 'play-game.bat'), path.join(PAYLOAD, 'Game', 'play-game.bat'));

// 项目源码
const SRC = path.join(PAYLOAD, 'Source');
for (const d of ['assets', 'settings', 'tools']) {
    const s = path.join(ROOT, d);
    if (fs.existsSync(s)) copyDir(s, path.join(SRC, d));
}
for (const f of ['package.json', 'tsconfig.json', 'README.md', 'LICENSE', '.gitignore']) {
    const s = path.join(ROOT, f);
    if (fs.existsSync(s)) copyFile(s, path.join(SRC, f));
}

// 指引（带 BOM 的 UTF-8，记事本才不乱码）
const guide = fs.readFileSync(path.join(__dirname, 'GUIDE.txt'));
fs.writeFileSync(path.join(PAYLOAD, '安装与开发指引.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), guide]));

// 卸载脚本
const uninstall = [
    '@echo off',
    'chcp 65001 >nul',
    'set T=%LOCALAPPDATA%\\AdventureSquad',
    'echo 正在卸载 AdventureSquad ...',
    'if not "%T%"=="" if "%T:~-15%"=="AdventureSquad" rd /s /q "%T%"',
    'del "%USERPROFILE%\\Desktop\\AdventureSquad.lnk" >nul 2>&1',
    'del "%USERPROFILE%\\Desktop\\卸载 AdventureSquad.lnk" >nul 2>&1',
    'echo 已卸载完成。',
    'pause',
].join('\r\n');
fs.writeFileSync(path.join(PAYLOAD, 'uninstall.cmd'), uninstall, 'utf8');

console.log('2/5 打载荷 zip…');
fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(OUT_ZIP)) fs.unlinkSync(OUT_ZIP);
execFileSync('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path '${PAYLOAD}\\*' -DestinationPath '${OUT_ZIP}' -Force`], { stdio: 'inherit' });

console.log('3/5 编译安装程序…');
if (fs.existsSync(OUT_EXE)) fs.unlinkSync(OUT_EXE);
execFileSync(CSC, [
    '/nologo', '/target:winexe', '/out:' + OUT_EXE,
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
    '/reference:System.IO.Compression.FileSystem.dll', '/reference:System.IO.Compression.dll',
    // 把载荷 zip 作为嵌入资源打进 exe，单文件安装包
    '/resource:' + OUT_ZIP + ',PayloadZip',
    path.join(__dirname, 'Installer.cs'),
], { stdio: 'inherit' });

console.log('4/5 清理中间文件…');
rmrf(TREE);

console.log('5/5 完成');
const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2) + ' MB';
console.log('');
console.log('  安装程序：' + OUT_EXE + '  (' + mb(OUT_EXE) + ')');
console.log('  安装载荷：' + OUT_ZIP + '  (' + mb(OUT_ZIP) + ')');
console.log('');
console.log('  两个文件要放在同一个目录里 —— 双击安装程序即可。');
