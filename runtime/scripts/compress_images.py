"""
图片压缩工具（公众号 browser 模式专用）

背景：browser 模式通过 imageToDataUri 把图片以 base64 内联进 HTML。
未压缩时单篇约 3.9MB，编辑器无法可靠接收，导致正文配图/品牌图整片空白
（而保存与核验仍成功，属静默故障）。

本脚本把品牌图与正文配图压缩为适合内联的体积：
- 统一转为 RGB（去除 alpha，避免 PNG 式膨胀）
- 长边限制在指定像素内
- 输出 JPEG（quality 可调）

原始文件备份为 *.orig.<ext>，可重复运行（幂等：已备份则从备份还原后再压缩）。
用法：
  python compress_images.py --dir <scripts_dir> --brand-dir <brand_assets_dir>
"""
import argparse
import io
import os
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow 未安装", file=sys.stderr)
    sys.exit(1)


def to_rgb(im):
    """把任意模式转为 RGB，白底铺 alpha，避免透明区域变黑。"""
    if im.mode == "RGB":
        return im
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return im.convert("RGB")


def compress(path, max_edge, quality):
    """压缩单张图片；返回 (原始字节, 压缩后字节, 尺寸)。"""
    orig_bytes = os.path.getsize(path)
    backup = path + ".orig" + os.path.splitext(path)[1]
    # 幂等：若已有备份，说明此前压缩过，从备份重新开始，避免二次压缩劣化
    source = backup if os.path.exists(backup) else path
    if not os.path.exists(backup):
        shutil.copy2(source, backup)

    im = Image.open(source)
    im = to_rgb(im)
    w, h = im.size
    if max(w, h) > max_edge:
        if w >= h:
            nw, nh = max_edge, max(1, round(h * max_edge / w))
        else:
            nw, nh = max(1, round(w * max_edge / h)), max_edge
        im = im.resize((nw, nh), Image.LANCZOS)

    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    data = buf.getvalue()

    # 仅当确有收益且确实更小时才覆盖
    if len(data) < orig_bytes:
        with open(path, "wb") as f:
            f.write(data)
    return orig_bytes, os.path.getsize(path), im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="账号 scripts 目录（正文配图所在）")
    ap.add_argument("--brand-dir", required=True, help="brand_assets 目录")
    ap.add_argument("--brand-max-edge", type=int, default=1000)
    ap.add_argument("--brand-quality", type=int, default=85)
    ap.add_argument("--content-max-edge", type=int, default=1000)
    ap.add_argument("--content-quality", type=int, default=82)
    ap.add_argument("--covers", action="store_true", help="同时压缩封面（封面走封面字段，通常无需内联）")
    args = ap.parse_args()

    total_before = total_after = 0

    print("=== 品牌图 ===")
    for name in ("brand_top.jpg", "brand_bot.jpg"):
        p = os.path.join(args.brand_dir, name)
        if not os.path.exists(p):
            print(f"  跳过（不存在）: {name}")
            continue
        b, a, sz = compress(p, args.brand_max_edge, args.brand_quality)
        total_before += b
        total_after += a
        print(f"  {name}: {b/1024:.0f}KB -> {a/1024:.0f}KB  {sz[0]}x{sz[1]}")

    print("=== 正文配图 ===")
    files = sorted(
        f for f in os.listdir(args.dir)
        if f.startswith("content_") and not f.endswith((".orig.png", ".orig.jpg"))
        and f.lower().endswith((".png", ".jpg", ".jpeg"))
    )
    for name in files:
        p = os.path.join(args.dir, name)
        b, a, sz = compress(p, args.content_max_edge, args.content_quality)
        total_before += b
        total_after += a
        print(f"  {name}: {b/1024:.0f}KB -> {a/1024:.0f}KB  {sz[0]}x{sz[1]}")

    if args.covers:
        print("=== 封面 ===")
        covers = sorted(
            f for f in os.listdir(args.dir)
            if f.startswith("cover_") and not f.endswith((".orig.png", ".orig.jpg"))
            and f.lower().endswith((".png", ".jpg", ".jpeg"))
        )
        for name in covers:
            p = os.path.join(args.dir, name)
            b, a, sz = compress(p, 1600, 88)
            total_before += b
            total_after += a
            print(f"  {name}: {b/1024:.0f}KB -> {a/1024:.0f}KB  {sz[0]}x{sz[1]}")

    print()
    print(f"合计: {total_before/1024/1024:.1f}MB -> {total_after/1024/1024:.1f}MB")
    # 估算单篇内联体积：品牌顶 + 品牌底 + 2 张正文图，base64 膨胀约 1.37 倍
    est = (total_after / max(1, len(files) + 2)) * 1.37 if files else 0
    print(f"单篇内联估算（品牌2+正文2, base64 后）: 约 {est/1024:.0f}KB")


if __name__ == "__main__":
    main()
