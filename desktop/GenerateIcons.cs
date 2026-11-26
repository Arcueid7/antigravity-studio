using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class GenerateIcons
{
    static GraphicsPath RoundedRect(RectangleF bounds, float radius)
    {
        float d = radius * 2f;
        var path = new GraphicsPath();
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    static GraphicsPath BuildAntigravityArch(float s)
    {
        var path = new GraphicsPath();
        // Smooth symmetric parabolic 'A' arch faithful to Antigravity icon
        path.AddBezier(128f * s, 44f * s, 146f * s, 44f * s, 159f * s, 67f * s, 173f * s, 114f * s);
        path.AddBezier(173f * s, 114f * s, 185f * s, 154f * s, 197f * s, 183f * s, 211f * s, 198f * s);
        path.AddBezier(211f * s, 198f * s, 219f * s, 206f * s, 214f * s, 216f * s, 202f * s, 214f * s);
        path.AddBezier(202f * s, 214f * s, 187f * s, 212f * s, 176f * s, 194f * s, 165f * s, 173f * s);
        path.AddBezier(165f * s, 173f * s, 153f * s, 149f * s, 142f * s, 137f * s, 128f * s, 137f * s);
        path.AddBezier(128f * s, 137f * s, 114f * s, 137f * s, 103f * s, 149f * s, 91f * s, 173f * s);
        path.AddBezier(91f * s, 173f * s, 80f * s, 194f * s, 69f * s, 212f * s, 54f * s, 214f * s);
        path.AddBezier(54f * s, 214f * s, 42f * s, 216f * s, 37f * s, 206f * s, 45f * s, 198f * s);
        path.AddBezier(45f * s, 198f * s, 59f * s, 183f * s, 71f * s, 154f * s, 83f * s, 114f * s);
        path.AddBezier(83f * s, 114f * s, 97f * s, 67f * s, 110f * s, 44f * s, 128f * s, 44f * s);
        path.CloseFigure();
        return path;
    }

    static void PaintRadialCloud(Graphics g, float cx, float cy, float rx, float ry, Color centerColor, Color midColor)
    {
        using (var ellipse = new GraphicsPath())
        {
            ellipse.AddEllipse(cx - rx, cy - ry, rx * 2f, ry * 2f);
            using (var pgb = new PathGradientBrush(ellipse))
            {
                pgb.CenterPoint = new PointF(cx, cy);
                var blend = new ColorBlend(3);
                blend.Colors = new[]
                {
                    Color.FromArgb(0, centerColor.R, centerColor.G, centerColor.B),
                    midColor,
                    centerColor
                };
                blend.Positions = new[] { 0f, 0.55f, 1f };
                pgb.InterpolationColors = blend;
                g.FillPath(pgb, ellipse);
            }
        }
    }

    static Bitmap RenderAppIcon(int size)
    {
        // Render at 2x supersampling (min 512px) for ultra-clean anti-aliased downscaling
        int hi = Math.Max(512, size * 2);
        var hiBmp = new Bitmap(hi, hi, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(hiBmp))
        {
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.Clear(Color.Transparent);

            float s = hi / 256f;

            // Crisp pure white squircle matching Antigravity desktop icon
            var rect = new RectangleF(10f * s, 10f * s, 236f * s, 236f * s);
            using (var sqPath = RoundedRect(rect, 56f * s))
            {
                using (var whiteBrush = new SolidBrush(Color.White))
                {
                    g.FillPath(whiteBrush, sqPath);
                }
                using (var borderPen = new Pen(Color.FromArgb(18, 15, 23, 42), Math.Max(1.5f, 2.5f * s)))
                {
                    g.DrawPath(borderPen, sqPath);
                }
            }

            // Clipped flowing multicolor Antigravity arch
            using (var archPath = BuildAntigravityArch(s))
            {
                var st = g.Save();
                g.SetClip(archPath, CombineMode.Intersect);

                // Base vibrant Google Blue vertical gradient
                using (var blueGrad = new LinearGradientBrush(
                    new PointF(128f * s, 40f * s),
                    new PointF(128f * s, 222f * s),
                    Color.FromArgb(255, 72, 140, 248),
                    Color.FromArgb(255, 32, 102, 234)))
                {
                    g.FillRectangle(blueGrad, 24f * s, 32f * s, 208f * s, 196f * s);
                }

                // Emerald Green upper-left shoulder
                PaintRadialCloud(
                    g, 82f * s, 102f * s, 78f * s, 78f * s,
                    Color.FromArgb(255, 52, 168, 83),
                    Color.FromArgb(200, 52, 168, 83));

                // Warm Gold / Amber upper-left-apex
                PaintRadialCloud(
                    g, 112f * s, 54f * s, 66f * s, 62f * s,
                    Color.FromArgb(255, 251, 188, 4),
                    Color.FromArgb(210, 249, 171, 0));

                // Coral Red / Orange apex & upper-right crest
                PaintRadialCloud(
                    g, 150f * s, 68f * s, 74f * s, 72f * s,
                    Color.FromArgb(255, 234, 67, 53),
                    Color.FromArgb(215, 234, 67, 53));

                // Soft Blue core rising smoothly in the inner arch bridge
                PaintRadialCloud(
                    g, 128f * s, 146f * s, 78f * s, 72f * s,
                    Color.FromArgb(245, 56, 128, 246),
                    Color.FromArgb(145, 45, 118, 242));

                g.Restore(st);
            }
        }

        if (size == hi) return hiBmp;

        var outBmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g2 = Graphics.FromImage(outBmp))
        {
            g2.SmoothingMode = SmoothingMode.HighQuality;
            g2.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g2.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g2.CompositingQuality = CompositingQuality.HighQuality;
            g2.DrawImage(hiBmp, new Rectangle(0, 0, size, size), new Rectangle(0, 0, hi, hi), GraphicsUnit.Pixel);
        }
        hiBmp.Dispose();
        return outBmp;
    }

    static byte[] ToPngBytes(Bitmap bmp)
    {
        using (var ms = new MemoryStream())
        {
            bmp.Save(ms, ImageFormat.Png);
            return ms.ToArray();
        }
    }

    static byte[] ToIcoDibBytes(Bitmap bmp)
    {
        int w = bmp.Width;
        int h = bmp.Height;
        int andRowBytes = ((w + 31) / 32) * 4;
        int xorBytes = w * h * 4;
        int andBytes = andRowBytes * h;

        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            // BITMAPINFOHEADER (40 bytes) — height is doubled (XOR + AND masks)
            bw.Write((uint)40);
            bw.Write(w);
            bw.Write(h * 2);
            bw.Write((ushort)1);    // planes
            bw.Write((ushort)32);   // 32-bit BGRA
            bw.Write((uint)0);      // BI_RGB
            bw.Write((uint)(xorBytes + andBytes));
            bw.Write(0);
            bw.Write(0);
            bw.Write((uint)0);
            bw.Write((uint)0);

            // Bottom-up 32-bit BGRA pixel data
            for (int y = h - 1; y >= 0; y--)
            {
                for (int x = 0; x < w; x++)
                {
                    Color c = bmp.GetPixel(x, y);
                    bw.Write(c.B);
                    bw.Write(c.G);
                    bw.Write(c.R);
                    bw.Write(c.A);
                }
            }

            // Bottom-up 1-bit AND transparency mask
            for (int y = h - 1; y >= 0; y--)
            {
                byte[] row = new byte[andRowBytes];
                for (int x = 0; x < w; x++)
                {
                    if (bmp.GetPixel(x, y).A == 0)
                    {
                        row[x / 8] |= (byte)(0x80 >> (x % 8));
                    }
                }
                bw.Write(row);
            }
            return ms.ToArray();
        }
    }

    static void WriteMultiSizeIco(string path, int[] sizes)
    {
        var images = new List<Tuple<int, byte[]>>();
        foreach (int sz in sizes)
        {
            using (var bmp = RenderAppIcon(sz))
            {
                // Standard Windows spec: 32-bit ARGB DIB for <=128px, PNG for 256px
                byte[] frame = sz >= 256 ? ToPngBytes(bmp) : ToIcoDibBytes(bmp);
                images.Add(Tuple.Create(sz, frame));
            }
        }

        using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);
            bw.Write((ushort)1);
            bw.Write((ushort)images.Count);

            int offset = 6 + 16 * images.Count;
            foreach (var img in images)
            {
                int sz = img.Item1;
                byte[] data = img.Item2;
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write((uint)data.Length);
                bw.Write((uint)offset);
                offset += data.Length;
            }

            foreach (var img in images)
            {
                bw.Write(img.Item2);
            }
        }
    }

    static int Main(string[] args)
    {
        string staticDir = args.Length > 0 ? args[0] : "static";
        Directory.CreateDirectory(staticDir);

        using (var bmp256 = RenderAppIcon(256))
        {
            bmp256.Save(Path.Combine(staticDir, "icon-256.png"), ImageFormat.Png);
        }
        using (var bmp512 = RenderAppIcon(512))
        {
            bmp512.Save(Path.Combine(staticDir, "icon-512.png"), ImageFormat.Png);
        }
        WriteMultiSizeIco(Path.Combine(staticDir, "icon.ico"), new[] { 16, 24, 32, 48, 64, 128, 256 });
        Console.WriteLine("Generated Antigravity icons in " + staticDir);
        return 0;
    }
}
