#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 WARDOGS 三张地图全部瓦片的下载清单。

输出（与本脚本同目录）：
  urls.txt   纯 URL 列表 —— 可直接拖进 IDM / Free Download Manager / Motrix 批量导入
  aria2.txt  aria2c 输入文件（带 dir/out，自动落到正确的目录和文件名）
  README-下载说明.txt

用法:
  python gen_urls.py [--out D:/WardogsArtillery/tiles] [--maps bakurani,ozeti,zestafona]
                     [--zooms 0-7] [--skip-existing]
"""
import argparse, os

CDN = "https://assets.wardogs-artillery.com/releases/assets-v1/maps/tiles"
ALL_MAPS = ["bakurani", "ozeti", "zestafona"]


def parse_zooms(s):
    if "-" in s:
        a, b = s.split("-")
        return list(range(int(a), int(b) + 1))
    return [int(x) for x in s.split(",")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.normpath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "tiles")))
    ap.add_argument("--maps", default=",".join(ALL_MAPS))
    ap.add_argument("--zooms", default="0-7")
    ap.add_argument("--skip-existing", action="store_true", default=True)
    ap.add_argument("--no-skip-existing", dest="skip_existing", action="store_false")
    args = ap.parse_args()

    out_root = os.path.abspath(args.out)
    maps = args.maps.split(",")
    zooms = parse_zooms(args.zooms)
    here = os.path.dirname(os.path.abspath(__file__))

    urls, a2, skipped = [], [], 0
    for m in maps:
        for z in zooms:
            n = 2 ** z
            for x in range(n):
                for y in range(n):
                    rel = os.path.join(m, f"zoom_{z}", f"{x}_{y}.webp")
                    dest = os.path.join(out_root, rel)
                    url = f"{CDN}/{m}/zoom_{z}/{x}_{y}.webp"
                    if args.skip_existing and os.path.exists(dest) and os.path.getsize(dest) > 0:
                        skipped += 1
                        continue
                    urls.append(url)
                    a2.append(url)
                    a2.append(f"  dir={os.path.dirname(dest)}")
                    a2.append(f"  out={os.path.basename(dest)}")

    with open(os.path.join(here, "urls.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(urls) + "\n")
    with open(os.path.join(here, "aria2.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(a2) + "\n")

    total_all = sum(2 ** (2 * z) for z in zooms) * len(maps)
    print(f"总瓦片数      : {total_all}")
    print(f"已存在（跳过）: {skipped}")
    print(f"待下载        : {len(urls)}")
    print(f"清单 1        : {os.path.join(here, 'urls.txt')}")
    print(f"清单 2        : {os.path.join(here, 'aria2.txt')}")
    print(f"落盘根目录    : {out_root}")


if __name__ == "__main__":
    main()
