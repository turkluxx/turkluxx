# Alpha-only extraction of the original JPG; do not regenerate or redraw the TL.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
public static class TurkLuxxCutout {
    public static void Save(string source, string destination) {
        using (var original = new Bitmap(source))
        using (var master = new Bitmap(282, 282, PixelFormat.Format32bppArgb)) {
            if (original.Width != 266 || original.Height != 266) throw new Exception("Unexpected source dimensions");
            // Follow the outer circumference, including the gold rim, rather
            // than the smaller navy disk. Eight pixels of transparent padding
            // keep that rim clear of every output canvas edge.
            const double cx = 134, cy = 134, radius = 133;
            const int padding = 8, samples = 8;
            for (int y = 0; y < original.Height; y++) {
                for (int x = 0; x < original.Width; x++) {
                    int covered = 0;
                    for (int sy = 0; sy < samples; sy++) {
                        for (int sx = 0; sx < samples; sx++) {
                            double dx = x + (sx + .5) / samples - cx;
                            double dy = y + (sy + .5) / samples - cy;
                            if (dx * dx + dy * dy <= radius * radius) covered++;
                        }
                    }
                    if (covered == 0) continue;
                    Color color = original.GetPixel(x, y);
                    if (covered < samples * samples) {
                        // JPEG edge pixels contain the beige matte. Use the
                        // adjacent inward rim color only for antialiased edge
                        // pixels; every fully covered original pixel is exact.
                        double dx = x + .5 - cx, dy = y + .5 - cy;
                        double distance = Math.Sqrt(dx * dx + dy * dy);
                        int ix = Math.Max(0, Math.Min(265, (int)Math.Floor(cx + dx * (distance - 1.5) / distance)));
                        int iy = Math.Max(0, Math.Min(265, (int)Math.Floor(cy + dy * (distance - 1.5) / distance)));
                        color = original.GetPixel(ix, iy);
                    }
                    int alpha = (int)Math.Round(255.0 * covered / (samples * samples));
                    master.SetPixel(x + padding, y + padding, Color.FromArgb(alpha, color.R, color.G, color.B));
                }
            }
            master.Save(destination, ImageFormat.Png);
        }
    }
}
'@
$projectRoot = Split-Path -Parent $PSScriptRoot
[TurkLuxxCutout]::Save((Join-Path $projectRoot 'img/favicon/source.jpg'), (Join-Path $projectRoot 'img/favicon/master.png'))
Write-Output 'Saved the original TL emblem with an antialiased transparent exterior.'
