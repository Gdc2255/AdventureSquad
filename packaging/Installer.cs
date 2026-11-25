using System;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

// AdventureSquad 安装程序
// 用 .NET Framework 自带的 csc 编译，接收方不需要装任何运行时。
// 安装载荷（zip）以嵌入资源的形式打进本 exe，双击即可安装，不需要额外文件。
class InstallerForm : Form
{
    const string AppName = "AdventureSquad";
    const string PayloadResource = "PayloadZip";
    string installDir;
    ProgressBar bar;
    Label status;
    Button installBtn, cancelBtn;

    public InstallerForm()
    {
        installDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);

        Text = AppName + " 安装程序";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(440, 210);
        Font = new Font("Microsoft YaHei UI", 9F);

        var title = new Label
        {
            Text = AppName,
            Font = new Font("Microsoft YaHei UI", 16F, FontStyle.Bold),
            ForeColor = Color.FromArgb(180, 140, 40),
            AutoSize = true,
            Location = new Point(22, 18),
        };
        Controls.Add(title);

        var desc = new Label
        {
            Text = "一个用 Cocos Creator 做的 2D roguelike 射击小游戏。\r\n" +
                   "安装后会得到游戏本体和项目源码。\r\n\r\n" +
                   "安装目录：" + installDir,
            AutoSize = true,
            Location = new Point(22, 56),
            ForeColor = Color.FromArgb(70, 76, 92),
        };
        Controls.Add(desc);

        bar = new ProgressBar
        {
            Style = ProgressBarStyle.Continuous,
            Location = new Point(22, 150),
            Size = new Size(396, 18),
        };
        Controls.Add(bar);

        status = new Label
        {
            Text = "就绪",
            AutoSize = true,
            Location = new Point(22, 174),
            ForeColor = Color.FromArgb(110, 118, 138),
        };
        Controls.Add(status);

        installBtn = new Button
        {
            Text = "开始安装",
            Location = new Point(238, 126),
            Size = new Size(88, 28),
        };
        installBtn.Click += (s, e) => DoInstall();
        Controls.Add(installBtn);

        cancelBtn = new Button
        {
            Text = "取消",
            Location = new Point(330, 126),
            Size = new Size(88, 28),
        };
        cancelBtn.Click += (s, e) => { Close(); };
        Controls.Add(cancelBtn);
    }

    void DoInstall()
    {
        installBtn.Enabled = false;
        cancelBtn.Enabled = false;
        try
        {
            bar.Maximum = 100;
            status.Text = "正在解压...";
            Application.DoEvents();

            // 载荷优先取嵌入资源（单文件安装包）；没有就退回同目录的 zip（方便调试）
            Stream payload = OpenPayload();
            if (payload == null)
            {
                MessageBox.Show("安装包里没有找到载荷（嵌入资源损坏）。\r\n" +
                                "请重新下载完整的安装程序。",
                                AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                installBtn.Enabled = true; cancelBtn.Enabled = true;
                return;
            }

            using (payload)
            using (var zip = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                int total = zip.Entries.Count;
                int done = 0;
                foreach (var entry in zip.Entries)
                {
                    string target = Path.Combine(installDir, entry.FullName);
                    if (entry.FullName.EndsWith("/") || entry.Name.Length == 0)
                    {
                        Directory.CreateDirectory(target);
                        continue;
                    }
                    string dir = Path.GetDirectoryName(target);
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    entry.ExtractToFile(target, true);
                    done++;
                    if (total > 0)
                    {
                        bar.Value = Math.Min(100, done * 100 / total);
                        status.Text = "正在解压... " + done + "/" + total;
                        Application.DoEvents();
                    }
                }
            }

            status.Text = "正在创建快捷方式...";
            Application.DoEvents();
            CreateShortcuts();

            bar.Value = 100;
            status.Text = "安装完成";
            MessageBox.Show(
                "安装完成！\r\n\r\n" +
                "桌面上的「AdventureSquad」双击即可开始游戏。\r\n" +
                "安装目录里的「安装与开发指引.txt」写了怎么玩，\r\n" +
                "以及怎么用 Cocos Creator 打开源码继续开发。\r\n\r\n" +
                "安装目录：" + installDir,
                AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show("安装失败：\r\n" + ex.Message, AppName,
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            installBtn.Enabled = true; cancelBtn.Enabled = true;
        }
    }

    /// 打开安装载荷：优先嵌入资源，其次同目录的 zip
    Stream OpenPayload()
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        Stream s = asm.GetManifestResourceStream(PayloadResource);
        if (s != null) return s;
        string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
        string[] zips = Directory.GetFiles(exeDir, AppName + "-*.zip");
        if (zips.Length > 0) return File.OpenRead(zips[0]);
        return null;
    }

    void CreateShortcuts()
    {
        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
        string launcher = Path.Combine(installDir, "Game", "play-game.bat");
        string uninstall = Path.Combine(installDir, "uninstall.cmd");

        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return;
        object shell = Activator.CreateInstance(shellType);
        try
        {
            var mk = shellType.GetMethod("CreateShortcut");
            var sc = mk.Invoke(shell, new object[] { Path.Combine(desktop, AppName + ".lnk") });
            try
            {
                Set(sc, "TargetPath", launcher);
                Set(sc, "WorkingDirectory", Path.Combine(installDir, "Game"));
                Set(sc, "Description", AppName);
                Invoke(sc, "Save");
            }
            finally { System.Runtime.InteropServices.Marshal.ReleaseComObject(sc); }

            var un = mk.Invoke(shell, new object[] { Path.Combine(desktop, "卸载 " + AppName + ".lnk") });
            try
            {
                Set(un, "TargetPath", uninstall);
                Set(un, "WorkingDirectory", installDir);
                Invoke(un, "Save");
            }
            finally { System.Runtime.InteropServices.Marshal.ReleaseComObject(un); }
        }
        finally { System.Runtime.InteropServices.Marshal.ReleaseComObject(shell); }
    }

    static void Set(object shortcut, string prop, object value)
    {
        shortcut.GetType().InvokeMember(prop,
            System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { value });
    }

    static void Invoke(object shortcut, string method)
    {
        shortcut.GetType().InvokeMember(method,
            System.Reflection.BindingFlags.InvokeMethod, null, shortcut, null);
    }
}

class Program
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerForm());
    }
}
