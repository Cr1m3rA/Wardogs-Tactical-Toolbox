# -*- coding: utf-8 -*-
"""全量瓦片完整性校验：数量、魔数、残缺清单。"""
import os, json

ROOT = r"D:\WardogsArtillery\tiles"
MAPS = ["bakurani", "ozeti", "zestafona"]

def webp_ok(p):
    try:
        with open(p, "rb") as f:
            h = f.read(12)
        return h[:4] == b"RIFF" and h[8:12] == b"WEBP"
    except OSError:
        return False

grand_ok = grand_bad = grand_missing = 0
report = {}
for m in MAPS:
    ok = bad = missing = 0
    bad_list = []
    for z in range(8):
        n = 2 ** z
        d = os.path.join(ROOT, m, f"zoom_{z}")
        for x in range(n):
            for y in range(n):
                p = os.path.join(d, f"{x}_{y}.webp")
                if not os.path.exists(p):
                    missing += 1
                elif not webp_ok(p) or os.path.getsize(p) < 100:
                    bad += 1
                    bad_list.append(f"zoom_{z}/{x}_{y}")
                else:
                    ok += 1
    grand_ok += ok; grand_bad += bad; grand_missing += missing
    report[m] = {"ok": ok, "bad": bad, "missing": missing, "bad_list": bad_list[:20]}
    print(f"{m:10s} 有效 {ok:6d}  残缺 {bad:4d}  缺失 {missing:4d}  (应 21845)")

total = grand_ok + grand_bad + grand_missing
print(f"\n合计 有效 {grand_ok} / {total}  残缺 {grand_bad}  缺失 {grand_missing}")
size = 0
for root, _, files in os.walk(ROOT):
    for f in files:
        if f.endswith(".webp"):
            size += os.path.getsize(os.path.join(root, f))
print(f"总体积 {size/1048576:.1f} MB")
with open(os.path.join(ROOT, "_integrity.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, indent=1, ensure_ascii=False)
print("PASS" if grand_bad == 0 and grand_missing == 0 else "FAIL")
