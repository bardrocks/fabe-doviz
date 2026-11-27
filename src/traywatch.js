/*
 * Windows görev çubuğunda bildirim alanının (^ oku, simgeler, saat) yerini bulur.
 * Gizli bir PowerShell, user32 ile Shell_TrayWnd / TrayNotifyWnd pencere dikdörtgenlerini
 * 3 sn'de bir yazar; böylece kutu her zaman saatin / ^ okunun hemen soluna yerleşir.
 */
const { spawn } = require('child_process');
const { screen, app } = require('electron');
const fs = require('fs');
const path = require('path');

const PS = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class FabeW {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
}
"@
[FabeW]::SetProcessDPIAware() | Out-Null
while ($true) {
  $t = [FabeW]::FindWindow("Shell_TrayWnd", $null)
  $line = "none"
  if ($t -ne [IntPtr]::Zero) {
    $n = [FabeW]::FindWindowEx($t, [IntPtr]::Zero, "TrayNotifyWnd", $null)
    $a = New-Object FabeW+RECT; $b = New-Object FabeW+RECT
    if ($n -ne [IntPtr]::Zero -and [FabeW]::GetWindowRect($n, [ref]$a) -and [FabeW]::GetWindowRect($t, [ref]$b)) {
      $line = "$($a.L) $($a.T) $($a.R) $($a.B) $($b.L) $($b.T) $($b.R) $($b.B)"
    }
  }
  [Console]::Out.WriteLine($line); [Console]::Out.Flush()
  Start-Sleep -Seconds 3
}
`;

class TrayWatch {
  constructor(onChange) {
    this.onChange = onChange; // ({ notify: {x,y,width,height}, taskbar: {...} } | null)
    this.proc = null;
    this.last = '';
    this.value = null;
    this.restarts = 0;
  }

  start() {
    if (process.platform !== 'win32') return;
    try {
      // Betik açıkça bir dosyaya yazılıp çalıştırılır (gizli/kodlanmış komut yok)
      const file = path.join(app.getPath('userData'), 'gorev-cubugu.ps1');
      fs.writeFileSync(file, '\ufeff' + PS, 'utf8');
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (_) { return; }
    let buf = '';
    this.proc.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { this.line(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
    });
    this.proc.on('exit', () => {
      this.proc = null;
      if (!this.stopped && this.restarts++ < 5) setTimeout(() => this.start(), 5000);
    });
  }

  line(l) {
    if (l === this.last) return;
    this.last = l;
    const n = l.split(/\s+/).map(Number);
    let v = null;
    if (n.length === 8 && n.every(Number.isFinite)) {
      const toDip = (L, T, R, B) => {
        const r = { x: L, y: T, width: R - L, height: B - T };
        try { return screen.screenToDipRect(null, r); } catch (_) { return r; }
      };
      const notify = toDip(n[0], n[1], n[2], n[3]);
      const taskbar = toDip(n[4], n[5], n[6], n[7]);
      // Mantık kontrolü: bildirim alanı görev çubuğunun içinde ve makul genişlikte olmalı
      const inside = notify.x >= taskbar.x - 2 && notify.x + notify.width <= taskbar.x + taskbar.width + 2;
      if (inside && notify.width > 40 && taskbar.width > taskbar.height) v = { notify, taskbar };
    }
    this.value = v;
    this.onChange(v);
  }

  stop() {
    this.stopped = true;
    if (this.proc) try { this.proc.kill(); } catch (_) {}
  }
}

module.exports = { TrayWatch };
