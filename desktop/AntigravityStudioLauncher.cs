using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AntigravityStudioDesktop
{
    static class NativeMethods
    {
        public const int SW_RESTORE = 9;
        public const int JobObjectExtendedLimitInformation = 9;
        public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        public const int WM_NCCALCSIZE = 0x0083;
        public const int WM_NCHITTEST = 0x0084;
        public const int WM_NCLBUTTONDOWN = 0x00A1;
        public const int HTCAPTION = 2;
        public const int HTLEFT = 10;
        public const int HTRIGHT = 11;
        public const int HTTOP = 12;
        public const int HTTOPLEFT = 13;
        public const int HTTOPRIGHT = 14;
        public const int HTBOTTOM = 15;
        public const int HTBOTTOMLEFT = 16;
        public const int HTBOTTOMRIGHT = 17;

        public const int WS_THICKFRAME = 0x00040000;
        public const int WS_MINIMIZEBOX = 0x00020000;
        public const int WS_MAXIMIZEBOX = 0x00010000;
        public const int WS_SYSMENU = 0x00080000;
        public const int WS_CAPTION = 0x00C00000;

        public const int SM_CXSIZEFRAME = 32;
        public const int SM_CYSIZEFRAME = 33;
        public const int SM_CXPADDEDBORDER = 92;

        public const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
        public const int DWMWCP_ROUND = 2;

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool SetDllDirectory(string lpPathName);

        [DllImport("dwmapi.dll")]
        public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        [DllImport("dwmapi.dll")]
        public static extern int DwmExtendFrameIntoClientArea(IntPtr hwnd, ref MARGINS pMarInset);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetInformationJobObject(
            IntPtr hJob,
            int infoType,
            IntPtr lpJobObjectInfo,
            uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential)]
        public struct MARGINS
        {
            public int cxLeftWidth;
            public int cxRightWidth;
            public int cyTopHeight;
            public int cyBottomHeight;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int left;
            public int top;
            public int right;
            public int bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct NCCALCSIZE_PARAMS
        {
            public RECT rgrc0;
            public RECT rgrc1;
            public RECT rgrc2;
            public IntPtr lppos;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }
    }

    sealed class ChildProcessJob : IDisposable
    {
        private IntPtr _jobHandle = IntPtr.Zero;

        public ChildProcessJob()
        {
            _jobHandle = NativeMethods.CreateJobObject(IntPtr.Zero, null);
            if (_jobHandle == IntPtr.Zero) return;

            var info = new NativeMethods.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = NativeMethods.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            int length = Marshal.SizeOf(typeof(NativeMethods.JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr ptr = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(info, ptr, false);
                NativeMethods.SetInformationJobObject(
                    _jobHandle,
                    NativeMethods.JobObjectExtendedLimitInformation,
                    ptr,
                    (uint)length);
            }
            finally
            {
                Marshal.FreeHGlobal(ptr);
            }
        }

        public void AddProcess(Process process)
        {
            if (_jobHandle != IntPtr.Zero && process != null && !process.HasExited)
            {
                try
                {
                    NativeMethods.AssignProcessToJobObject(_jobHandle, process.Handle);
                }
                catch { }
            }
        }

        public void Dispose()
        {
            if (_jobHandle != IntPtr.Zero)
            {
                NativeMethods.CloseHandle(_jobHandle);
                _jobHandle = IntPtr.Zero;
            }
        }
    }

    sealed class FramelessStudioForm : Form
    {
        private readonly string _url;
        private readonly string _profileDir;
        private readonly Color _initialBg;
        private readonly WebView2 _webView;
        private const int ResizeBorder = 5;

        public FramelessStudioForm(string url, string profileDir, string iconPath, Color initialBg)
        {
            _url = url;
            _profileDir = profileDir;
            _initialBg = initialBg;

            Text = "Antigravity Studio";
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(1340, 860);
            MinimumSize = new Size(760, 520);
            FormBorderStyle = FormBorderStyle.None;
            BackColor = initialBg;
            Padding = new Padding(2);
            DoubleBuffered = true;

            try
            {
                if (File.Exists(iconPath))
                {
                    Icon = new Icon(iconPath);
                }
                else
                {
                    Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }
            }
            catch { }

            _webView = new WebView2();
            _webView.Dock = DockStyle.Fill;
            _webView.DefaultBackgroundColor = initialBg;
            Controls.Add(_webView);

            Load += OnFormLoad;
            SizeChanged += OnFormSizeChanged;
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.Style |= NativeMethods.WS_THICKFRAME | NativeMethods.WS_MINIMIZEBOX | NativeMethods.WS_MAXIMIZEBOX | NativeMethods.WS_SYSMENU;
                cp.Style &= ~NativeMethods.WS_CAPTION;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                int pref = NativeMethods.DWMWCP_ROUND;
                NativeMethods.DwmSetWindowAttribute(Handle, NativeMethods.DWMWA_WINDOW_CORNER_PREFERENCE, ref pref, sizeof(int));
                var margins = new NativeMethods.MARGINS { cxLeftWidth = 0, cxRightWidth = 0, cyTopHeight = 1, cyBottomHeight = 0 };
                NativeMethods.DwmExtendFrameIntoClientArea(Handle, ref margins);
            }
            catch { }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == NativeMethods.WM_NCCALCSIZE && m.WParam != IntPtr.Zero)
            {
                if (WindowState == FormWindowState.Maximized)
                {
                    var ncc = (NativeMethods.NCCALCSIZE_PARAMS)Marshal.PtrToStructure(m.LParam, typeof(NativeMethods.NCCALCSIZE_PARAMS));
                    int frameX = NativeMethods.GetSystemMetrics(NativeMethods.SM_CXSIZEFRAME) + NativeMethods.GetSystemMetrics(NativeMethods.SM_CXPADDEDBORDER);
                    int frameY = NativeMethods.GetSystemMetrics(NativeMethods.SM_CYSIZEFRAME) + NativeMethods.GetSystemMetrics(NativeMethods.SM_CXPADDEDBORDER);
                    ncc.rgrc0.left += frameX;
                    ncc.rgrc0.right -= frameX;
                    ncc.rgrc0.top += frameY;
                    ncc.rgrc0.bottom -= frameY;
                    Marshal.StructureToPtr(ncc, m.LParam, false);
                }
                m.Result = IntPtr.Zero;
                return;
            }

            if (m.Msg == NativeMethods.WM_NCHITTEST)
            {
                base.WndProc(ref m);
                if (WindowState == FormWindowState.Normal)
                {
                    Point pt = PointToClient(Cursor.Position);
                    bool left = pt.X <= ResizeBorder;
                    bool right = pt.X >= ClientSize.Width - ResizeBorder;
                    bool top = pt.Y <= ResizeBorder;
                    bool bottom = pt.Y >= ClientSize.Height - ResizeBorder;

                    if (top && left) { m.Result = (IntPtr)NativeMethods.HTTOPLEFT; return; }
                    if (top && right) { m.Result = (IntPtr)NativeMethods.HTTOPRIGHT; return; }
                    if (bottom && left) { m.Result = (IntPtr)NativeMethods.HTBOTTOMLEFT; return; }
                    if (bottom && right) { m.Result = (IntPtr)NativeMethods.HTBOTTOMRIGHT; return; }
                    if (left) { m.Result = (IntPtr)NativeMethods.HTLEFT; return; }
                    if (right) { m.Result = (IntPtr)NativeMethods.HTRIGHT; return; }
                    if (top) { m.Result = (IntPtr)NativeMethods.HTTOP; return; }
                    if (bottom) { m.Result = (IntPtr)NativeMethods.HTBOTTOM; return; }
                }
                return;
            }

            base.WndProc(ref m);
        }

        private void OnFormSizeChanged(object sender, EventArgs e)
        {
            Padding = WindowState == FormWindowState.Maximized ? new Padding(0) : new Padding(2);
            NotifyWindowStateToWeb();
        }

        private void NotifyWindowStateToWeb()
        {
            if (_webView == null || _webView.CoreWebView2 == null) return;
            try
            {
                string st = WindowState == FormWindowState.Maximized ? "maximized" : "normal";
                _webView.CoreWebView2.ExecuteScriptAsync("window.__onDesktopWindowState && window.__onDesktopWindowState('" + st + "');");
            }
            catch { }
        }

        private async void OnFormLoad(object sender, EventArgs e)
        {
            try
            {
                Directory.CreateDirectory(_profileDir);
                var env = await CoreWebView2Environment.CreateAsync(null, _profileDir, null);
                await _webView.EnsureCoreWebView2Async(env);

                var core = _webView.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = true;
                core.Settings.AreDevToolsEnabled = true;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsZoomControlEnabled = true;

                // Mark page as running inside native frameless desktop shell safely before/after DOM ready
                await core.AddScriptToExecuteOnDocumentCreatedAsync(
                    "window.__ANTIGRAVITY_DESKTOP__ = true;" +
                    "if (document.documentElement) { document.documentElement.classList.add('is-desktop-shell'); }" +
                    "else { document.addEventListener('DOMContentLoaded', function(){ document.documentElement.classList.add('is-desktop-shell'); }); }"
                );

                core.WebMessageReceived += OnWebMessageReceived;
                core.NewWindowRequested += OnNewWindowRequested;
                core.NavigationCompleted += delegate
                {
                    try { core.ExecuteScriptAsync("document.documentElement.classList.add('is-desktop-shell');"); } catch { }
                    NotifyWindowStateToWeb();
                };

                core.Navigate(_url);
            }
            catch (Exception ex)
            {
                Program.Log("WebView2 init error: " + ex);
                MessageBox.Show(
                    "WebView2 \u521D\u59CB\u5316\u5931\u8D25\uFF1A" + ex.Message,
                    "Antigravity Studio",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Close();
            }
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            try
            {
                if (!string.IsNullOrEmpty(e.Uri) &&
                    (e.Uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                     e.Uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase)))
                {
                    Process.Start(e.Uri);
                }
            }
            catch { }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg = "";
            try { msg = e.TryGetWebMessageAsString() ?? ""; } catch { return; }

            if (msg == "window:drag")
            {
                NativeMethods.ReleaseCapture();
                NativeMethods.SendMessage(Handle, NativeMethods.WM_NCLBUTTONDOWN, (IntPtr)NativeMethods.HTCAPTION, IntPtr.Zero);
            }
            else if (msg == "window:minimize")
            {
                WindowState = FormWindowState.Minimized;
            }
            else if (msg == "window:toggle-maximize")
            {
                WindowState = WindowState == FormWindowState.Maximized
                    ? FormWindowState.Normal
                    : FormWindowState.Maximized;
                NotifyWindowStateToWeb();
            }
            else if (msg == "window:fullscreen")
            {
                WindowState = WindowState == FormWindowState.Maximized
                    ? FormWindowState.Normal
                    : FormWindowState.Maximized;
                NotifyWindowStateToWeb();
            }
            else if (msg == "window:close")
            {
                Close();
            }
            else if (msg.StartsWith("window:bg:"))
            {
                string hex = msg.Substring("window:bg:".Length).Trim();
                try
                {
                    Color c = ColorTranslator.FromHtml(hex);
                    BackColor = c;
                    _webView.DefaultBackgroundColor = c;
                }
                catch { }
            }
        }
    }

    static class Program
    {
        public static string AppDir;
        public static string DataDir;
        public static string LogPath;

        [STAThread]
        static int Main(string[] args)
        {
            try { NativeMethods.SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            AppDir = ResolveAppDir();
            DataDir = Path.Combine(AppDir, "data");
            Directory.CreateDirectory(DataDir);
            LogPath = Path.Combine(DataDir, "desktop-launcher.log");

            // Load Microsoft WebView2 assemblies & WebView2Loader.dll cleanly from desktop\lib
            string libDir = Path.Combine(Path.Combine(AppDir, "desktop"), "lib");
            if (Directory.Exists(libDir))
            {
                try { NativeMethods.SetDllDirectory(libDir); } catch { }
                AppDomain.CurrentDomain.AssemblyResolve += delegate(object s, ResolveEventArgs ev)
                {
                    string shortName = new AssemblyName(ev.Name).Name;
                    string candidate = Path.Combine(libDir, shortName + ".dll");
                    if (File.Exists(candidate))
                    {
                        return Assembly.LoadFrom(candidate);
                    }
                    return null;
                };
            }

            int port = 8765;
            bool smokeTest = false;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--port" && i + 1 < args.Length)
                {
                    int parsed;
                    if (int.TryParse(args[i + 1], out parsed) && parsed > 1024 && parsed < 65535)
                    {
                        port = parsed;
                    }
                    i++;
                }
                else if (args[i] == "--smoke-test")
                {
                    smokeTest = true;
                }
            }

            if (smokeTest)
            {
                return RunSmokeTest(port);
            }

            bool createdNew;
            string mutexName = string.Format("Local\\AntigravityStudioApp_Port_{0}", port);
            using (var mutex = new Mutex(true, mutexName, out createdNew))
            {
                if (!createdNew)
                {
                    FocusExistingAppWindow();
                    return 0;
                }
                return RunDesktopApp(port);
            }
        }

        static string ResolveAppDir()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            if (File.Exists(Path.Combine(baseDir, "server.py"))) return baseDir;
            string parent = Path.GetDirectoryName(baseDir);
            if (!string.IsNullOrEmpty(parent) && File.Exists(Path.Combine(parent, "server.py"))) return parent;
            return baseDir;
        }

        public static void Log(string msg)
        {
            try
            {
                File.AppendAllText(
                    LogPath,
                    string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}{2}", DateTime.Now, msg, Environment.NewLine),
                    Encoding.UTF8);
            }
            catch { }
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        static string CheckWebView2Version()
        {
            try
            {
                return CoreWebView2Environment.GetAvailableBrowserVersionString();
            }
            catch (Exception ex)
            {
                return "ERR: " + ex.Message;
            }
        }

        static int RunSmokeTest(int port)
        {
            string reportPath = Path.Combine(DataDir, "smoke-test.log");
            var lines = new List<string>();
            lines.Add("Antigravity Studio Frameless WebView2 Smoke Test");
            lines.Add("AppDir: " + AppDir);
            lines.Add("Port: " + port);

            string pythonPath = FindPythonBinary();
            string wv2Ver = CheckWebView2Version();
            lines.Add("Python: " + (pythonPath ?? "NOT FOUND"));
            lines.Add("WebView2 Runtime: " + wv2Ver);

            if (string.IsNullOrEmpty(pythonPath))
            {
                lines.Add("RESULT: FAIL (python not found)");
                File.WriteAllLines(reportPath, lines.ToArray(), Encoding.UTF8);
                return 2;
            }

            using (var job = new ChildProcessJob())
            {
                Process serverProc = null;
                try
                {
                    serverProc = StartBackendServer(pythonPath, port, job);
                    bool ready = WaitForHttpOk(string.Format("http://127.0.0.1:{0}/api/status", port), 10000);
                    lines.Add("Server /api/status ready: " + ready);

                    bool faviconOk = WaitForHttpOk(string.Format("http://127.0.0.1:{0}/favicon.ico", port), 3000);
                    lines.Add("Server /favicon.ico ready: " + faviconOk);

                    bool wv2Ok = !string.IsNullOrEmpty(wv2Ver) && !wv2Ver.StartsWith("ERR:");
                    bool pass = ready && faviconOk && wv2Ok;
                    lines.Add("RESULT: " + (pass ? "PASS" : "FAIL"));
                    File.WriteAllLines(reportPath, lines.ToArray(), Encoding.UTF8);
                    return pass ? 0 : 3;
                }
                catch (Exception ex)
                {
                    lines.Add("EXCEPTION: " + ex.Message);
                    lines.Add("RESULT: FAIL");
                    File.WriteAllLines(reportPath, lines.ToArray(), Encoding.UTF8);
                    return 4;
                }
                finally
                {
                    StopProcessQuietly(serverProc);
                }
            }
        }

        static Color ReadInitialBackgroundColor()
        {
            try
            {
                string settingsPath = Path.Combine(DataDir, "settings.json");
                if (File.Exists(settingsPath))
                {
                    string txt = File.ReadAllText(settingsPath, Encoding.UTF8);
                    if (txt.IndexOf("\"theme\": \"dark\"", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return Color.FromArgb(29, 29, 27);
                    }
                }
            }
            catch { }
            return Color.FromArgb(243, 241, 233);
        }

        static int RunDesktopApp(int port)
        {
            string serverPy = Path.Combine(AppDir, "server.py");
            if (!File.Exists(serverPy))
            {
                MessageBox.Show(
                    "\u672A\u627E\u5230 server.py\uFF0C\u8BF7\u786E\u8BA4 AntigravityStudio.exe \u4F4D\u4E8E\u9879\u76EE\u6839\u76EE\u5F55\u4E2D\u3002",
                    "Antigravity Studio",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }

            string pythonPath = FindPythonBinary();
            if (string.IsNullOrEmpty(pythonPath))
            {
                MessageBox.Show(
                    "\u672A\u68C0\u6D4B\u5230 Python \u8FD0\u884C\u73AF\u5883\uFF0C\u8BF7\u786E\u8BA4 python.exe \u5DF2\u5B89\u88C5\u5E76\u52A0\u5165 PATH\u3002",
                    "Antigravity Studio",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }

            using (var job = new ChildProcessJob())
            {
                Process serverProc = null;
                try
                {
                    StopStalePythonOnPort(port);

                    Log("Starting server.py via " + pythonPath + " on port " + port);
                    serverProc = StartBackendServer(pythonPath, port, job);

                    string statusUrl = string.Format("http://127.0.0.1:{0}/api/status", port);
                    if (!WaitForHttpOk(statusUrl, 12000))
                    {
                        MessageBox.Show(
                            "\u672C\u5730\u540E\u7AEF\u670D\u52A1\u542F\u52A8\u8D85\u65F6\uFF0C\u8BF7\u67E5\u770B data\\desktop-server.log \u4E86\u89E3\u8BE6\u60C5\u3002",
                            "Antigravity Studio",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                        return 2;
                    }

                    string url = string.Format("http://127.0.0.1:{0}", port);
                    string profileDir = Path.Combine(DataDir, "webview2-profile");
                    string iconPath = Path.Combine(Path.Combine(AppDir, "static"), "icon.ico");
                    Color initialBg = ReadInitialBackgroundColor();

                    RunFramelessWindow(url, profileDir, iconPath, initialBg);
                    Log("Desktop window closed cleanly.");
                }
                catch (Exception ex)
                {
                    Log("Fatal error: " + ex);
                    MessageBox.Show(
                        "\u542F\u52A8\u5931\u8D25\uFF1A" + ex.Message,
                        "Antigravity Studio",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return 3;
                }
                finally
                {
                    StopProcessQuietly(serverProc);
                }
            }
            return 0;
        }

        // Kept in separate method so WebView2 assembly resolution runs before JIT loads this method
        [MethodImpl(MethodImplOptions.NoInlining)]
        static void RunFramelessWindow(string url, string profileDir, string iconPath, Color initialBg)
        {
            using (var form = new FramelessStudioForm(url, profileDir, iconPath, initialBg))
            {
                Application.Run(form);
            }
        }

        static Process StartBackendServer(string pythonPath, int port, ChildProcessJob job)
        {
            string serverLog = Path.Combine(DataDir, "desktop-server.log");
            string serverPy = Path.Combine(AppDir, "server.py");

            var psi = new ProcessStartInfo();
            psi.FileName = pythonPath;
            psi.Arguments = string.Format("-u \"{0}\" --port {1}", serverPy, port);
            psi.WorkingDirectory = AppDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;
            psi.StandardErrorEncoding = Encoding.UTF8;
            psi.EnvironmentVariables["PYTHONUTF8"] = "1";
            psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";

            var proc = new Process();
            proc.StartInfo = psi;
            proc.Start();
            job.AddProcess(proc);

            try { File.WriteAllText(serverLog, "", Encoding.UTF8); } catch { }

            ThreadPool.QueueUserWorkItem(delegate { PumpStreamToFile(proc.StandardOutput, serverLog); });
            ThreadPool.QueueUserWorkItem(delegate { PumpStreamToFile(proc.StandardError, serverLog); });
            return proc;
        }

        static void PumpStreamToFile(StreamReader reader, string path)
        {
            try
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    try { File.AppendAllText(path, line + Environment.NewLine, Encoding.UTF8); } catch { }
                }
            }
            catch { }
        }

        static bool WaitForHttpOk(string url, int timeoutMs)
        {
            DateTime deadline = DateTime.Now.AddMilliseconds(timeoutMs);
            while (DateTime.Now < deadline)
            {
                try
                {
                    var req = (HttpWebRequest)WebRequest.Create(url);
                    req.Method = "GET";
                    req.Timeout = 800;
                    req.ReadWriteTimeout = 800;
                    req.Proxy = null;
                    using (var resp = (HttpWebResponse)req.GetResponse())
                    {
                        if ((int)resp.StatusCode >= 200 && (int)resp.StatusCode < 300) return true;
                    }
                }
                catch { }
                Thread.Sleep(80);
            }
            return false;
        }

        static void StopStalePythonOnPort(int port)
        {
            try
            {
                var psi = new ProcessStartInfo();
                psi.FileName = "netstat.exe";
                psi.Arguments = "-ano";
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;

                string output;
                using (var p = Process.Start(psi))
                {
                    output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);
                }

                string needle = string.Format("127.0.0.1:{0}", port);
                var pids = new HashSet<int>();
                foreach (string rawLine in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    if (rawLine.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0 &&
                        rawLine.IndexOf("LISTENING", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        var m = Regex.Match(rawLine.Trim(), @"(\d+)$");
                        int pid;
                        if (m.Success && int.TryParse(m.Groups[1].Value, out pid) && pid > 0) pids.Add(pid);
                    }
                }

                foreach (int pid in pids)
                {
                    try
                    {
                        var proc = Process.GetProcessById(pid);
                        string pname = (proc.ProcessName ?? "").ToLowerInvariant();
                        if (pname == "python" || pname == "pythonw" || pname == "python3")
                        {
                            Log("Stopping existing Python server PID " + pid + " on port " + port);
                            proc.Kill();
                            proc.WaitForExit(2000);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        static void StopProcessQuietly(Process proc)
        {
            if (proc == null) return;
            try
            {
                if (!proc.HasExited)
                {
                    proc.Kill();
                    proc.WaitForExit(2000);
                }
            }
            catch { }
            finally
            {
                try { proc.Dispose(); } catch { }
            }
        }

        static string FindPythonBinary()
        {
            var candidates = new List<string>();
            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in pathEnv.Split(';'))
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                candidates.Add(Path.Combine(dir.Trim(), "python.exe"));
            }

            candidates.Add(@"C:\msys64\ucrt64\bin\python.exe");
            candidates.Add(@"C:\msys64\mingw64\bin\python.exe");

            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (!string.IsNullOrEmpty(localApp))
            {
                string pyRoot = Path.Combine(localApp, @"Programs\Python");
                if (Directory.Exists(pyRoot))
                {
                    try
                    {
                        foreach (string sub in Directory.GetDirectories(pyRoot, "Python*"))
                        {
                            candidates.Add(Path.Combine(sub, "python.exe"));
                        }
                    }
                    catch { }
                }
            }

            foreach (string cand in candidates)
            {
                if (File.Exists(cand) &&
                    cand.IndexOf("WindowsApps", StringComparison.OrdinalIgnoreCase) < 0)
                {
                    return cand;
                }
            }
            return null;
        }

        static bool FocusExistingAppWindow()
        {
            IntPtr target = IntPtr.Zero;
            NativeMethods.EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
            {
                if (!NativeMethods.IsWindowVisible(hWnd)) return true;
                int len = NativeMethods.GetWindowTextLength(hWnd);
                if (len <= 0) return true;
                var sb = new StringBuilder(len + 1);
                NativeMethods.GetWindowText(hWnd, sb, sb.Capacity);
                if (sb.ToString().IndexOf("Antigravity Studio", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    target = hWnd;
                    return false;
                }
                return true;
            }, IntPtr.Zero);

            if (target != IntPtr.Zero)
            {
                NativeMethods.ShowWindow(target, NativeMethods.SW_RESTORE);
                NativeMethods.SetForegroundWindow(target);
                return true;
            }
            return false;
        }
    }
}
