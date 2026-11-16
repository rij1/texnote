using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

namespace TeXNoteLauncher
{
    class Program
    {
        private static bool isExiting = false;
        private static string activeDistro = null;
        private static Process keepaliveProcess = null;

        static void Main(string[] args)
        {
            Console.Title = "TeXNote - LaTeX Studio (by IRSpace)";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
========================================================================
         _____        __ _   _       _       
        |_   _|____  _\ \ | | | ___ | |_ ___ 
          | | / _ \ \/ /\ |  \| |/ _ \| __/ _ \
          | ||  __/>  < / | |\  | (_) | ||  __/
          |_| \___/_/\_\\_|_| \_|\___/ \__\___|
                          
                 (by IRSpace - Rijwan Ansari)
========================================================================");
            Console.ResetColor();

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("[*] Initializing TeXNote Environment...");
            Console.ResetColor();

            // Set up Ctrl+C / Exit handler
            Console.CancelKeyPress += (sender, e) =>
            {
                e.Cancel = true;
                Shutdown();
            };

            // 1. Detect which WSL distro to use (TeXNote dedicated distro or Ubuntu dev distro)
            activeDistro = DetectWslDistro();
            if (activeDistro == null)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[-] Error: No compatible TeXNote WSL engine found!");
                Console.WriteLine("    Please run 'Install_TeXNote.exe' or 'TeXNote_Setup_v1.0.exe'");
                Console.WriteLine("    to set up the engine, or verify WSL2 is enabled.");
                Console.ResetColor();
                Console.WriteLine();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[+] Engine detected: WSL (" + activeDistro + ")");
            Console.ResetColor();

            // 2. Start a persistent keepalive process so WSL2 NEVER idles out or suspends
            StartKeepalive(activeDistro);

            // 3. Ensure backend service is running
            EnsureServiceRunning(activeDistro);

            // 4. Poll until port 7777 is alive
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.Write("[*] Connecting to TeXNote server on port 7777");
            Console.ResetColor();

            bool online = WaitForServer("http://127.0.0.1:7777/status", 35);
            Console.WriteLine();

            if (online)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[+] TeXNote Server is ONLINE!");
                Console.ResetColor();

                string url = "http://localhost:7777";
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("[*] Opening your default browser at: " + url);
                Console.ResetColor();

                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = url,
                        UseShellExecute = true
                    });
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[-] Could not launch browser automatically: " + ex.Message);
                    Console.ResetColor();
                }

                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine("------------------------------------------------------------------------");
                Console.ForegroundColor = ConsoleColor.White;
                Console.WriteLine(" TeXNote Server is active and ready.");
                Console.WriteLine(" URL: http://localhost:7777");
                Console.WriteLine();
                Console.WriteLine(" Keep this Command Prompt window open while using TeXNote.");
                Console.WriteLine(" Press [Ctrl+C] in this window to stop the server.");
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine("------------------------------------------------------------------------");
                Console.ResetColor();
                Console.WriteLine();

                // 5. Active watchdog loop: keeps WSL awake and auto-heals if services ever blip
                int tick = 0;
                while (!isExiting)
                {
                    Thread.Sleep(1000);
                    tick++;

                    // Every 5 seconds, perform a lightweight health check
                    if (tick % 5 == 0)
                    {
                        if (keepaliveProcess == null || keepaliveProcess.HasExited)
                        {
                            StartKeepalive(activeDistro);
                        }

                        if (!CheckServerAlive("http://127.0.0.1:7777/status"))
                        {
                            Console.ForegroundColor = ConsoleColor.Yellow;
                            Console.WriteLine("\n[*] Service blip detected, restoring TeXNote services...");
                            Console.ResetColor();
                            StartKeepalive(activeDistro);
                            EnsureServiceRunning(activeDistro);
                        }
                    }
                }
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[-] Timed out waiting for TeXNote server to start.");
                Console.WriteLine("[-] Please check WSL and service status.");
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
            }
        }

        static void StartKeepalive(string distro)
        {
            try
            {
                if (keepaliveProcess != null && !keepaliveProcess.HasExited)
                {
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "wsl.exe",
                    Arguments = string.Format("-d {0} -u root -- sleep infinity", distro),
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                keepaliveProcess = Process.Start(psi);
            }
            catch
            {
                // Non-fatal if keepalive fails to start
            }
        }

        static string DetectWslDistro()
        {
            // First check dedicated TeXNote distro
            if (CheckDistroExists("TeXNote")) return "TeXNote";
            // Fallback to Ubuntu distro ONLY if TeXNote backend services are installed in it
            if (CheckDistroExists("Ubuntu") && HasTeXNoteService("Ubuntu")) return "Ubuntu";
            return null;
        }

        static bool HasTeXNoteService(string distro)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "wsl.exe",
                    Arguments = string.Format("-d {0} -u root -- systemctl list-unit-files", distro),
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process proc = Process.Start(psi))
                {
                    string output = proc.StandardOutput.ReadToEnd();
                    proc.WaitForExit();
                    return output.Contains("overleaf.service") || output.Contains("texnote.service");
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

        static void EnsureServiceRunning(string distro)
        {
            try
            {
                string serviceName = "overleaf.service";
                try
                {
                    ProcessStartInfo checkPsi = new ProcessStartInfo
                    {
                        FileName = "wsl.exe",
                        Arguments = string.Format("-d {0} -u root -- systemctl list-unit-files texnote.service", distro),
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    using (Process checkProc = Process.Start(checkPsi))
                    {
                        string checkOut = checkProc.StandardOutput.ReadToEnd();
                        checkProc.WaitForExit();
                        if (checkOut.Contains("texnote.service"))
                        {
                            serviceName = "texnote.service";
                        }
                    }
                }
                catch { }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "wsl.exe",
                    Arguments = string.Format("-d {0} -u root -- systemctl is-active {1}", distro, serviceName),
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process proc = Process.Start(psi))
                {
                    string output = proc.StandardOutput.ReadToEnd().Trim();
                    proc.WaitForExit();
                    if (output != "active")
                    {
                        Console.WriteLine("[*] Starting backend services (" + serviceName + ") in " + distro + "...");
                        ProcessStartInfo startPsi = new ProcessStartInfo
                        {
                            FileName = "wsl.exe",
                            Arguments = string.Format("-d {0} -u root -- systemctl start {1}", distro, serviceName),
                            UseShellExecute = false,
                            CreateNoWindow = true
                        };
                        using (Process startProc = Process.Start(startPsi))
                        {
                            startProc.WaitForExit();
                        }
                    }
                    else
                    {
                        Console.WriteLine("[*] Backend service (" + serviceName + ") is running in " + distro + ".");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[-] Note: " + ex.Message);
            }
        }

        static bool CheckServerAlive(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Proxy = null;
                request.Timeout = 2500;
                request.KeepAlive = false;
                request.AllowAutoRedirect = false;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    int code = (int)response.StatusCode;
                    return code >= 200 && code < 400;
                }
            }
            catch
            {
                return false;
            }
        }

        static bool WaitForServer(string url, int timeoutSeconds)
        {
            DateTime start = DateTime.Now;
            while ((DateTime.Now - start).TotalSeconds < timeoutSeconds)
            {
                if (CheckServerAlive(url))
                {
                    return true;
                }

                Console.Write(".");
                Thread.Sleep(1000);
            }
            return false;
        }

        static void Shutdown()
        {
            if (isExiting) return;
            isExiting = true;

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("[*] TeXNote is shutting down...");
            Console.ResetColor();

            try
            {
                if (keepaliveProcess != null && !keepaliveProcess.HasExited)
                {
                    keepaliveProcess.Kill();
                }
            }
            catch { }

            Thread.Sleep(500);
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[+] Done. Goodbye!");
            Console.ResetColor();
            Environment.Exit(0);
        }
    }
}
