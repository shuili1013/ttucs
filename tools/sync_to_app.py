#!/usr/bin/env python3
"""把 data-pipeline 最新爬取結果複製進前端 app/public/data。"""
import json, glob, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srcs = sorted(glob.glob(os.path.join(ROOT, "data-pipeline", "data", "*", "*", "all.json")))
if not srcs:
    raise SystemExit("找不到爬取結果，請先跑 scrape.py")
src = srcs[-1]
stamp = os.path.basename(os.path.dirname(src))
year = os.path.basename(os.path.dirname(os.path.dirname(src)))
courses = json.load(open(src, encoding="utf-8"))

app_data = os.path.join(ROOT, "app", "public", "data")
d = os.path.join(app_data, year, stamp)
os.makedirs(d, exist_ok=True)
# 清掉舊版本資料夾
for old in glob.glob(os.path.join(app_data, "*", "*")):
    if os.path.isdir(old) and os.path.basename(old) != stamp:
        shutil.rmtree(old)
json.dump(courses, open(os.path.join(d, "all.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump({"latest": stamp, "history": {stamp: "線上爬取"}},
          open(os.path.join(app_data, year, "version.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump({"latest": year, "history": {year: year[:-1] + "學年"}},
          open(os.path.join(app_data, "version.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"已同步 {len(courses)} 門課到前端 (版本 {stamp})")
