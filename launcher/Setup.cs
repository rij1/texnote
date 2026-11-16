using System;
using System.IO;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;

namespace TeXNoteSetup
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.Title = "TeXNote Setup - Installer (by IRSpace)";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
========================================================================
                 TeXNote (by IRSpace) - Installer
                 Author  : Rijwan Ansari
                 Company : IRSpace
========================================================================");
            Console.ResetColor();
            Console.WriteLine();

            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\TeXNote");
            string currentDir = AppDomain.CurrentDomain.BaseDirectory;

            Console.WriteLine("[*] Destination folder: " + appDir);

            try
            {
                if (!Directory.Exists(appDir))
                {
                    Directory.CreateDirectory(appDir);
                }

                // 1. Check WSL Status
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[*] Checking Windows Subsystem for Linux (WSL2)...");
                Console.ResetColor();

                if (!IsWslAvailable())
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[-] WSL2 is not enabled on this system.");
                    Console.WriteLine("    Please open PowerShell as Administrator and run: wsl --install");
                    Console.WriteLine("    Then restart your PC and run this installer again.");
                    Console.ResetColor();
                    Console.WriteLine("Press any key to exit...");
                    Console.ReadKey();
                    return;
                }
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("  [+] WSL2 is available.");
                Console.ResetColor();

                // 2. Check for TeXNote Engine
                string engineTar = FindEngineArchive(currentDir);
                string engineDir = Path.Combine(appDir, "engine");

                if (engineTar != null)
                {
                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("[*] Found offline engine archive: " + Path.GetFileName(engineTar));
                    Console.ResetColor();

                    if (!CheckDistroExists("TeXNote"))
                    {
                        Console.WriteLine("[*] Registering TeXNote WSL engine into: " + engineDir);
                        Console.WriteLine("    (This will take 1-2 minutes. Please wait...)");

                        if (!Directory.Exists(engineDir))
                        {
                            Directory.CreateDirectory(engineDir);
                        }

                        string fileToImport = engineTar;
                        string extractedTar = Path.Combine(engineDir, "texnote-engine.tar");

                        // Check if archive contains an inner tar archive
                        bool isInnerTar = false;
                        try
                        {
                            ProcessStartInfo checkTarPsi = new ProcessStartInfo
                            {
                                FileName = "tar.exe",
                                Arguments = string.Format("-tf \"{0}\"", engineTar),
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
                            RunProcess("tar.exe", string.Format("-xf \"{0}\" -C \"{1}\"", engineTar, engineDir));
                            if (File.Exists(extractedTar))
                            {
                                fileToImport = extractedTar;
                            }
                        }

                        string importArgs = string.Format("--import TeXNote \"{0}\" \"{1}\" --version 2", engineDir, fileToImport);
                        RunProcess("wsl.exe", importArgs);

                        if (File.Exists(extractedTar))
                        {
                            try { File.Delete(extractedTar); } catch { }
                        }

                        if (CheckDistroExists("TeXNote"))
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("  [+] TeXNote Engine registered successfully!");
                            Console.ResetColor();
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine("  [-] Error: Please verify WSL2 status. Engine registration failed.");
                            Console.ResetColor();
                        }
                    }
                    else
                    {
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("  [+] TeXNote Engine is already registered.");
                        Console.ResetColor();
                    }
                }
                else
                {
                    // Check if local dev Ubuntu distro has the service
                    if (CheckDistroExists("Ubuntu"))
                    {
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("  [+] Detected existing local development engine (WSL Ubuntu).");
                        Console.ResetColor();
                    }
                    else if (!CheckDistroExists("TeXNote"))
                    {
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine();
                        Console.WriteLine("========================================================================");
                        Console.WriteLine(" [!] NOTICE: Offline Engine Archive Not Found!");
                        Console.WriteLine("========================================================================");
                        Console.ForegroundColor = ConsoleColor.White;
                        Console.WriteLine(" TeXNote requires the LaTeX Engine (~1.5 GB package) containing:");
                        Console.WriteLine("  - Full TeX Live compiler (pdflatex, xelatex, bibtex, latexmk)");
                        Console.WriteLine("  - Node.js backend services, MongoDB, and Redis");
                        Console.WriteLine();
                        Console.WriteLine(" If you downloaded only the installer (.exe), you can:");
                        Console.WriteLine("  1. Download the complete 'TeXNote-Windows-x64.zip' with engine from:");
                        Console.WriteLine("     https://github.com/IRSpace/TeXNote/releases");
                        Console.WriteLine("  2. Place 'texnote-engine.tar' in this same folder and rerun.");
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("========================================================================");
                        Console.ResetColor();
                        Console.WriteLine();
                    }
                }

                // 3. Copy executable, cmd, and icon
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[*] Installing TeXNote launcher files...");
                Console.ResetColor();

                string[] filesToCopy = new string[] { "TeXNote.exe", "TeXNote.cmd", "TeXNote.ico" };
                foreach (string f in filesToCopy)
                {
                    string src = Path.Combine(currentDir, f);
                    string dst = Path.Combine(appDir, f);
                    if (File.Exists(src))
                    {
                        File.Copy(src, dst, true);
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("  [+] Copied: " + f);
                        Console.ResetColor();
                    }
                    else
                    {
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("  [-] Note: Source " + f + " not found in current directory.");
                        Console.ResetColor();
                    }
                }

                // 4. Create Desktop Shortcut
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopLnk = Path.Combine(desktopDir, "TeXNote.lnk");
                CreateShortcut(desktopLnk, Path.Combine(appDir, "TeXNote.exe"), Path.Combine(appDir, "TeXNote.ico"), "TeXNote - Professional LaTeX Studio (by IRSpace)");
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("  [+] Created Desktop Shortcut: TeXNote.lnk");
                Console.ResetColor();

                // 5. Create Start Menu Shortcut
                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), @"Programs\TeXNote");
                if (!Directory.Exists(startMenuDir))
                {
                    Directory.CreateDirectory(startMenuDir);
                }
                string startMenuLnk = Path.Combine(startMenuDir, "TeXNote.lnk");
                CreateShortcut(startMenuLnk, Path.Combine(appDir, "TeXNote.exe"), Path.Combine(appDir, "TeXNote.ico"), "TeXNote - Professional LaTeX Studio (by IRSpace)");
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("  [+] Created Start Menu Shortcut: TeXNote");
                Console.ResetColor();

                // 6. Create Uninstaller script in appDir
                string uninstallScript = Path.Combine(appDir, "Uninstall.cmd");
                File.WriteAllText(uninstallScript, string.Format(@"@echo off
echo ===================================================
echo             Uninstalling TeXNote (IRSpace)
echo ===================================================
echo [*] Removing shortcuts...
del ""{0}"" 2>nul
rmdir /s /q ""{1}"" 2>nul

set /p DEL_ENGINE=Do you also want to remove the TeXNote WSL engine? (Y/N): 
if /i ""%DEL_ENGINE%""==""Y"" (
    echo [*] Unregistering TeXNote WSL distro...
    wsl.exe --unregister TeXNote 2>nul
)

echo [*] Removing program files...
cd /d ""%LOCALAPPDATA%\Programs""
rmdir /s /q ""{2}"" 2>nul

echo [+] TeXNote uninstalled successfully.
pause", desktopLnk, startMenuDir, appDir));
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("  [+] Created Uninstaller: Uninstall.cmd");
                Console.ResetColor();

                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("========================================================================");
                Console.ForegroundColor = ConsoleColor.White;
                Console.WriteLine(" Installation complete! You can now launch TeXNote from your Desktop");
                Console.WriteLine(" or Start Menu with a single click.");
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
                Console.WriteLine("[-] Installation failed: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
            }
        }

        static string FindEngineArchive(string dir)
        {
            string[] possible = new string[] {
                "texnote-engine.tar",
                "texnote-engine.tar.gz",
                "texnote-rootfs.tar",
                "texnote-rootfs.tar.gz"
            };
            foreach (string name in possible)
            {
                string p = Path.Combine(dir, name);
                if (File.Exists(p)) return p;
            }
            return null;
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
