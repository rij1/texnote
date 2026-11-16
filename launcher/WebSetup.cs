using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Reflection;
using System.Threading;

namespace TeXNoteWebSetup
{
    class Program
    {
        // Default download URL - change this to your GitHub repository release URL
        private const string DEFAULT_ENGINE_URL = "https://github.com/rij1/texnote/releases/download/v1.0.0/texnote-engine.tar.gz";

        private static bool isDownloadFinished = false;
        private static bool downloadError = false;
        private static DateTime lastProgressUpdate = DateTime.MinValue;

        static void Main(string[] args)
        {
            Console.Title = "TeXNote Online Setup (by IRSpace)";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
========================================================================
             TeXNote - Online Web Installer (Bootstrapper)
             Author  : Rijwan Ansari
             Company : IRSpace
             License : GNU AGPLv3
========================================================================");
            Console.ResetColor();
            Console.WriteLine();

            string downloadUrl = DEFAULT_ENGINE_URL;
            if (args.Length > 0 && !string.IsNullOrEmpty(args[0]) && args[0].StartsWith("http"))
            {
                downloadUrl = args[0];
            }

            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\TeXNote");
            string engineDir = Path.Combine(appDir, "engine");
            string tempDir = Path.Combine(appDir, "temp");
            string targetTarGz = Path.Combine(tempDir, "texnote-engine.tar.gz");

            try
            {
                // 1. Check WSL Status
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[*] Step 1/4: Checking system requirements...");
                Console.ResetColor();

                if (!IsWslAvailable())
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[-] WSL2 is not enabled on this Windows computer.");
                    Console.WriteLine("    Please open PowerShell as Administrator and run: wsl --install");
                    Console.WriteLine("    After restarting your PC, run this installer again.");
                    Console.ResetColor();
                    Console.WriteLine("\nPress any key to exit...");
                    Console.ReadKey();
                    return;
                }
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("  [+] Windows Subsystem for Linux (WSL2) is ready.");
                Console.ResetColor();

                Directory.CreateDirectory(appDir);
                Directory.CreateDirectory(engineDir);
                Directory.CreateDirectory(tempDir);

                // 2. Extract Embedded Launcher Binaries
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\n[*] Step 2/4: Installing TeXNote desktop binaries...");
                Console.ResetColor();

                ExtractEmbeddedFile("TeXNoteLauncher", Path.Combine(appDir, "TeXNote.exe"));
                ExtractEmbeddedFile("TeXNoteIcon", Path.Combine(appDir, "TeXNote.ico"));

                // Fallback: check if local TeXNote.exe or TeXNote.ico exists in current directory
                string currentDir = AppDomain.CurrentDomain.BaseDirectory;
                string localExe = Path.Combine(currentDir, "TeXNote.exe");
                string localIco = Path.Combine(currentDir, "TeXNote.ico");
                if (!File.Exists(Path.Combine(appDir, "TeXNote.exe")) && File.Exists(localExe))
                {
                    File.Copy(localExe, Path.Combine(appDir, "TeXNote.exe"), true);
                }
                if (!File.Exists(Path.Combine(appDir, "TeXNote.ico")) && File.Exists(localIco))
                {
                    File.Copy(localIco, Path.Combine(appDir, "TeXNote.ico"), true);
                }

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("  [+] Extracted TeXNote launcher & icons.");
                Console.ResetColor();

                // 3. Download & Register Engine
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\n[*] Step 3/4: Setting up TeXLive & Linux Backend Engine...");
                Console.ResetColor();

                if (CheckDistroExists("TeXNote"))
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("  [+] Existing TeXNote engine is already registered in WSL.");
                    Console.ResetColor();
                }
                else
                {
                    // Check if local engine archive exists in current folder
                    string localArchive = Path.Combine(currentDir, "texnote-engine.tar.gz");
                    if (File.Exists(localArchive))
                    {
                        Console.ForegroundColor = ConsoleColor.Cyan;
                        Console.WriteLine("  [*] Found local engine archive: " + localArchive);
                        Console.ResetColor();
                        targetTarGz = localArchive;
                    }
                    else
                    {
                        Console.ForegroundColor = ConsoleColor.Cyan;
                        Console.WriteLine("  [*] Downloading LaTeX engine from cloud server:");
                        Console.WriteLine("      " + downloadUrl);
                        Console.ResetColor();

                        DownloadEngine(downloadUrl, targetTarGz);

                        if (downloadError || !File.Exists(targetTarGz))
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine("\n[-] Download was interrupted or URL was unreachable.");
                            Console.WriteLine("    Please check your internet connection or download manually from:");
                            Console.WriteLine("    " + DEFAULT_ENGINE_URL);
                            Console.ResetColor();
                            Console.WriteLine("\nPress any key to exit...");
                            Console.ReadKey();
                            return;
                        }
                    }

                    string fileToImport = targetTarGz;
                    string extractedTar = Path.Combine(tempDir, "texnote-engine.tar");

                    // Check if the archive contains an inner tar archive (tar inside tar.gz)
                    bool isInnerTar = false;
                    try
                    {
                        ProcessStartInfo checkTarPsi = new ProcessStartInfo
                        {
                            FileName = "tar.exe",
                            Arguments = string.Format("-tf \"{0}\"", targetTarGz),
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            UseShellExecute = false,
                            CreateNoWindow = true
                        };
                        using (Process checkTarProc = Process.Start(checkTarPsi))
                        {
                            string firstLine = checkTarProc.StandardOutput.ReadLine();
                            if (firstLine != null && firstLine.Trim().IndexOf("texnote-engine.tar", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                isInnerTar = true;
                            }
                            checkTarProc.WaitForExit();
                        }
                    }
                    catch { }

                    if (isInnerTar)
                    {
                        Console.ForegroundColor = ConsoleColor.Cyan;
                        Console.WriteLine("  [*] Unpacking engine package (this takes ~15-30 seconds)...");
                        Console.ResetColor();
                        RunProcess("tar.exe", string.Format("-xf \"{0}\" -C \"{1}\"", targetTarGz, tempDir));
                        if (File.Exists(extractedTar))
                        {
                            fileToImport = extractedTar;
                        }
                    }

                    Console.WriteLine("\n[*] Importing engine into WSL2 (this takes 1-2 minutes, please wait)...");
                    string importArgs = string.Format("--import TeXNote \"{0}\" \"{1}\" --version 2", engineDir, fileToImport);
                    RunProcess("wsl.exe", importArgs);

                    if (CheckDistroExists("TeXNote"))
                    {
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("  [+] TeXNote Engine imported successfully!");
                        Console.ResetColor();

                        // Clean up temp archive to reclaim disk space
                        if (File.Exists(targetTarGz) && targetTarGz.StartsWith(tempDir))
                        {
                            try { File.Delete(targetTarGz); } catch { }
                        }
                        if (File.Exists(extractedTar) && extractedTar.StartsWith(tempDir))
                        {
                            try { File.Delete(extractedTar); } catch { }
                        }
                    }
                    else
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine("\n[-] Error: Failed to register TeXNote WSL engine!");
                        Console.WriteLine("    Please verify WSL2 is working properly by running: wsl --status");
                        Console.ResetColor();
                        Console.WriteLine("\nPress any key to exit...");
                        Console.ReadKey();
                        return;
                    }
                }

                // 4. Create Shortcuts & Uninstaller
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\n[*] Step 4/4: Creating desktop shortcuts & uninstaller...");
                Console.ResetColor();

                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopLnk = Path.Combine(desktopDir, "TeXNote.lnk");
                CreateShortcut(desktopLnk, Path.Combine(appDir, "TeXNote.exe"), Path.Combine(appDir, "TeXNote.ico"), "TeXNote - LaTeX Studio (by IRSpace)");

                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), @"Programs\TeXNote");
                Directory.CreateDirectory(startMenuDir);
                string startMenuLnk = Path.Combine(startMenuDir, "TeXNote.lnk");
                CreateShortcut(startMenuLnk, Path.Combine(appDir, "TeXNote.exe"), Path.Combine(appDir, "TeXNote.ico"), "TeXNote - LaTeX Studio (by IRSpace)");

                string uninstallCmd = Path.Combine(appDir, "Uninstall.cmd");
                File.WriteAllText(uninstallCmd, string.Format(@"@echo off
echo ========================================================
echo              Uninstalling TeXNote (IRSpace)
echo ========================================================
echo [*] Removing shortcuts...
del ""{0}"" 2>nul
rmdir /s /q ""{1}"" 2>nul

set /p DEL_DISTRO=Do you want to delete the TeXNote WSL engine? (Y/N): 
if /i ""%DEL_DISTRO%""==""Y"" (
    echo [*] Unregistering TeXNote WSL distro...
    wsl.exe --unregister TeXNote 2>nul
)

echo [*] Removing application files...
cd /d ""%LOCALAPPDATA%\Programs""
rmdir /s /q ""{2}"" 2>nul

echo [+] TeXNote uninstalled successfully.
pause", desktopLnk, startMenuDir, appDir));

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("  [+] Created Desktop Shortcut: TeXNote.lnk");
                Console.WriteLine("  [+] Created Start Menu entry: TeXNote");
                Console.WriteLine("  [+] Created Uninstaller: Uninstall.cmd");
                Console.ResetColor();

                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("========================================================================");
                Console.ForegroundColor = ConsoleColor.White;
                Console.WriteLine(" Installation Complete! TeXNote is ready to use.");
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("========================================================================");
                Console.ResetColor();
                Console.WriteLine();

                Console.Write("Would you like to launch TeXNote right now? (Y/N): ");
                string resp = Console.ReadLine();
                if (resp != null && resp.Trim().ToUpper().StartsWith("Y"))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = Path.Combine(appDir, "TeXNote.exe"),
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[-] Setup Error: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("\nPress any key to exit...");
                Console.ReadKey();
            }
        }

        static void DownloadEngine(string baseUrl, string destPath)
        {
            string p1Url = baseUrl + ".part1";
            string p2Url = baseUrl + ".part2";

            string tempDir = Path.GetDirectoryName(destPath);
            string p1Path = Path.Combine(tempDir, "texnote-engine.tar.gz.part1");
            string p2Path = Path.Combine(tempDir, "texnote-engine.tar.gz.part2");

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("  [*] Downloading LaTeX Engine (Part 1/2, ~1.75 GB)...");
            Console.WriteLine("      " + p1Url);
            Console.ResetColor();

            DownloadSingleFile(p1Url, p1Path);
            if (downloadError || !File.Exists(p1Path))
            {
                // Fallback: try direct single archive URL
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("  [*] Multi-part not detected, downloading single archive...");
                Console.ResetColor();
                downloadError = false;
                DownloadSingleFile(baseUrl, destPath);
                return;
            }

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("\n  [*] Downloading LaTeX Engine (Part 2/2, ~1.57 GB)...");
            Console.WriteLine("      " + p2Url);
            Console.ResetColor();

            DownloadSingleFile(p2Url, p2Path);
            if (downloadError || !File.Exists(p2Path))
            {
                return;
            }

            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("\n  [*] Assembling engine components into single package...");
            Console.ResetColor();

            using (FileStream output = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                byte[] buffer = new byte[16 * 1024 * 1024]; // 16 MB chunk buffer
                foreach (string part in new string[] { p1Path, p2Path })
                {
                    using (FileStream input = new FileStream(part, FileMode.Open, FileAccess.Read, FileShare.Read))
                    {
                        int bytesRead;
                        while ((bytesRead = input.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            output.Write(buffer, 0, bytesRead);
                        }
                    }
                    try { File.Delete(part); } catch { }
                }
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("  [+] Engine components assembled successfully!");
            Console.ResetColor();
        }

        static void DownloadSingleFile(string url, string destPath)
        {
            isDownloadFinished = false;
            downloadError = false;

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)3072;

            using (WebClient client = new WebClient())
            {
                client.Proxy = null;
                client.Headers.Add("User-Agent", "TeXNote-WebInstaller/1.0 (Windows NT 10.0; Win64; x64)");

                client.DownloadProgressChanged += (sender, e) =>
                {
                    if ((DateTime.Now - lastProgressUpdate).TotalMilliseconds < 250) return;
                    lastProgressUpdate = DateTime.Now;

                    double mbReceived = e.BytesReceived / (1024.0 * 1024.0);
                    double mbTotal = e.TotalBytesToReceive / (1024.0 * 1024.0);
                    int percentage = e.ProgressPercentage;

                    int barWidth = 35;
                    int filled = (percentage * barWidth) / 100;
                    string bar = new string('=', filled) + (filled < barWidth ? ">" : "") + new string(' ', Math.Max(0, barWidth - filled - 1));

                    Console.Write(string.Format("\r  [{0}] {1,3}% ({2:F1} MB / {3:F1} MB)   ", bar, percentage, mbReceived, mbTotal));
                };

                client.DownloadFileCompleted += (sender, e) =>
                {
                    if (e.Error != null)
                    {
                        downloadError = true;
                        Console.WriteLine("\n  [-] Download error: " + e.Error.Message);
                    }
                    else if (e.Cancelled)
                    {
                        downloadError = true;
                        Console.WriteLine("\n  [-] Download cancelled.");
                    }
                    else
                    {
                        Console.WriteLine("\n  [+] Download completed successfully!");
                    }
                    isDownloadFinished = true;
                };

                client.DownloadFileAsync(new Uri(url), destPath);

                while (!isDownloadFinished)
                {
                    Thread.Sleep(100);
                }
            }
        }

        static void ExtractEmbeddedFile(string resourceName, string outputPath)
        {
            try
            {
                Assembly asm = Assembly.GetExecutingAssembly();
                using (Stream stream = asm.GetManifestResourceStream(resourceName))
                {
                    if (stream != null)
                    {
                        using (FileStream fs = new FileStream(outputPath, FileMode.Create, FileAccess.Write))
                        {
                            byte[] buffer = new byte[8192];
                            int read;
                            while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                            {
                                fs.Write(buffer, 0, read);
                            }
                        }
                    }
                }
            }
            catch
            {
                // Silently continue if not embedded
            }
        }

        static bool IsWslAvailable()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "wsl.exe",
                    Arguments = "--status",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                    return proc.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }

        static bool CheckDistroExists(string distroName)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "wsl.exe",
                    Arguments = string.Format("-d {0} -- echo ok", distroName),
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                    return proc.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }

        static void RunProcess(string fileName, string args)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = args,
                    UseShellExecute = false,
                    CreateNoWindow = false
                };
                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[-] Command failed: " + ex.Message);
            }
        }

        static void CreateShortcut(string shortcutPath, string targetPath, string iconPath, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            dynamic shell = Activator.CreateInstance(shellType);
            dynamic shortcut = shell.CreateShortcut(shortcutPath);
            shortcut.TargetPath = targetPath;
            shortcut.WorkingDirectory = Path.GetDirectoryName(targetPath);
            shortcut.Description = description;
            if (File.Exists(iconPath))
            {
                shortcut.IconLocation = iconPath + ",0";
            }
            shortcut.Save();
        }
    }
}

