#!/usr/bin/env python3
"""
大同大學課程資料爬蟲
資料源：cousel.ttu.edu.tw 選課系統（需登入 session cookie）
輸出：與中山相同的靜態 JSON，供前端 app/ 讀取
  data/version.json
  data/{學年}/version.json
  data/{學年}/{更新時間}/all.json

策略：
  - 每個 List*.php 頁面都是同一個 8 欄 table.mistab（Action/Code/Name/Instructor/
    Required-Elective/Credit/Enrolled-Limit/Remark）。parse_mistab() 通用解析。
  - 上課時間不在欄位裡：用 ListTime.php 以 (SelDay 1-6 × SelSession 1-14) POST 爬，
    每個時段回傳當下有課的課程 → 反推每門課的 classTime[7]。
  - 系所不在欄位裡：ListTime 用 SelDepNo=00(不限系所) 一次抓全部；系所可另用
    ListClassCourse 依 SelDepNo 補（見 DEPARTMENTS）。

用法：
  cp .env.example .env        # 填 TTU_COOKIE
  python scrape.py            # 線上爬取
  python scrape.py --samples  # 離線：直接解析 samples/ 內的 html，驗證解析器
"""
import os, re, sys, json, html as htmllib, datetime
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "data"
BASE = "https://cousel.ttu.edu.tw/main"

# SelDepNo 選項（取自選課系統下拉選單）
DEPARTMENTS = {
    "05": "事資系所", "03": "化生系所", "04": "工設系所", "02": "電機系所",
    "19": "工程學院學士班", "06": "資工系所", "17": "設科所", "15": "應外系",
    "01": "機材系所", "12": "事資系所(原資經)", "09": "化生系所(原生工)",
    "07": "機材系所(原材料)", "14": "數媒系所", "23": "通識教育中心",
    "24": "外文組(英文)", "25": "外文組(日語)", "26": "體育室", "29": "華語教育中心",
}
DAYS = range(1, 7)          # 星期一~六
SESSIONS = range(1, 15)     # 第1節~第12節（含中午10/傍晚等）


# ----------------------------- 解析 -----------------------------
def _text(s: str) -> str:
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return htmllib.unescape(s).replace("\xa0", " ").strip()


def parse_mistab(page_html: str, department: str = "") -> list[dict]:
    """解析一頁 table.mistab，回傳課程 dict 陣列（classTime 先留空）。"""
    m = re.search(r'<table[^>]*class="mistab".*?</table>', page_html, flags=re.S | re.I)
    if not m:
        return []
    table = m.group(0)
    courses = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.S | re.I):
        # 跳過合計/小計列（Subtotal/Total，通常 bgcolor 為 GreenYellow/Lime 或含 colspan）
        if re.search(r'colspan=', tr, re.I):
            continue
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S | re.I)
        if len(tds) < 8:
            continue
        code = _text(tds[1])
        if not code or code in ("處理", "Action"):
            continue
        name_cell = tds[2]
        en = ""
        em = re.search(r'<div class="fontA">(.*?)</div>', name_cell, flags=re.S)
        if em:
            en = _text(em.group(1))
        name_zh = _text(re.sub(r'<div class="fontA">.*?</div>', "", name_cell, flags=re.S))
        teacher = _text(tds[3])
        reqelec = _text(tds[4])
        multiple_compulsory = "多選必修" in reqelec
        compulsory = ("必修" in reqelec or "Required" in reqelec) and not multiple_compulsory
        credit = _text(tds[5]).rstrip("0").rstrip(".") or _text(tds[5])
        credit = _text(tds[5])  # 保留原字串如 "3.0"
        enrolled_limit = _text(tds[6])  # e.g. "6/55 人"
        sel = lim = 0
        em = re.search(r"(\d+)\s*/\s*(\d+)", enrolled_limit)
        if em:
            sel, lim = int(em.group(1)), int(em.group(2))
        unlimited = (lim == 0)  # 大同：上限 0 代表無限制
        remark = _text(tds[7])
        courses.append({
            "id": code,
            "url": f"{BASE}/ViewClass.php",
            "multipleCompulsory": multiple_compulsory,
            "department": department,
            "grade": "",
            "class": "",
            "name": name_zh + (f" {en}" if en else ""),
            "credit": credit,
            "yearSemester": "期",
            "compulsory": compulsory,
            "restrict": lim,
            "select": sel,
            "selected": sel,
            "remaining": (9999 if unlimited else lim - sel),
            "teacher": teacher,
            "room": "",
            "classTime": ["", "", "", "", "", "", ""],
            "description": remark,
            "tags": [],
            "english": bool(en) and not name_zh,  # 純英文課名時視為英語授課（暫定）
        })
    return courses


# ---- classTime 反推：SelSession 值 → (weekday_index, period_char) ----
# classTime[7] 對應 週日..週六? 中山用 index0=週日。這裡用 0=週一 對齊 DAYS，
# 前端只要一致即可；如需改對齊點改這裡。
SESSION_TO_CHAR = {  # SelSession value -> 前端 timeSlot key（務必與 app/src/constants/timeSlot.ts 一致）
    1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
    8: "8", 9: "9", 10: "A", 11: "B", 12: "C", 13: "D", 14: "E",
}


def merge_class_time(courses_by_id: dict, time_hits: dict):
    """time_hits: {course_id: set((day,session))} → 填入 classTime[7]（index0=週一）。"""
    for cid, slots in time_hits.items():
        c = courses_by_id.get(cid)
        if not c:
            continue
        buckets = ["", "", "", "", "", "", ""]  # 週一..週日
        for day, session in sorted(slots):
            if 1 <= day <= 7:
                buckets[day - 1] += SESSION_TO_CHAR.get(session, str(session))
        c["classTime"] = buckets


# ----------------------------- 課程詳細頁 SchdSbjDetail -----------------------------
WEEKDAY_NAME_TO_IDX = {"星期一": 0, "星期二": 1, "星期三": 2, "星期四": 3,
                       "星期五": 4, "星期六": 5, "星期日": 6}
WEEKDAY_IDX_TO_CHAR = ["一", "二", "三", "四", "五", "六", "日"]
# 節次名稱 -> 前端 timeSlot key（對齊 SESSION_TO_CHAR / timeSlot.ts）
SESSION_NAME_TO_KEY = {
    "第一節": "1", "第二節": "2", "第三節": "3", "第四節": "4", "中午": "5",
    "第五節": "6", "第六節": "7", "第七節": "8", "第八節": "9", "傍晚": "A",
    "第九節": "B", "第十節": "C", "第十一節": "D", "第11節": "D",
    "第十二節": "E", "第12節": "E",
}

DETAIL_LABELS = ["科目代碼名稱", "選別", "學分數", "上課時數", "實驗時數",
                 "授課教師", "開課班級", "上課時間地點", "課程附註說明", "課程大綱"]


def parse_detail(html: str) -> dict:
    """解析 SchdSbjDetail.php 一頁，回傳 dict：
       hours, lab_hours, klass_raw, remark, syllabus, slots[(星期名,節次名,教室)]
    HTML 有未閉合 <tr>，故用「標籤 → 下一個標籤」切段的方式解析。
    """
    m = re.search(r'<table[^>]*mistab.*?</table>', html, re.S | re.I)
    table = m.group(0) if m else html
    found = sorted((table.find(lab), lab) for lab in DETAIL_LABELS if table.find(lab) >= 0)
    seg = {}
    for k, (idx, lab) in enumerate(found):
        end = found[k + 1][0] if k + 1 < len(found) else len(table)
        seg[lab] = table[idx + len(lab):end]

    d = {
        "hours": _text(seg.get("上課時數", "")),
        "lab_hours": _text(seg.get("實驗時數", "")),
        "klass_raw": _text(seg.get("開課班級", "")),
        "klass_list": [],  # [(系名, 年級班label)]，開課班級可能有多行（共同科目）
        "remark": _text(seg.get("課程附註說明", "")),
        "syllabus": "",
        "slots": [],
    }
    # 開課班級：每個 <br> 一行，行內兩個 <b>：系名 / 年級班別
    for line in re.split(r"<br", seg.get("開課班級", ""), flags=re.I):
        bolds = [
            htmllib.unescape(b).replace("\xa0", " ").strip()
            for b in re.findall(r"<b>\s*([^<]+?)\s*</b>", line)
            if b.strip()
        ]
        if len(bolds) >= 2:
            d["klass_list"].append((bolds[0], bolds[1]))
    mm = re.search(r'href="([^"]+)"', seg.get("課程大綱", ""))
    if mm:
        d["syllabus"] = mm.group(1)
    # 上課時間地點：每個 <br> 一行，行內三個 <b>：星期 / 節次 / 教室
    for line in re.split(r"<br", seg.get("上課時間地點", ""), flags=re.I):
        bolds = [
            htmllib.unescape(b).replace("\xa0", " ").strip()
            for b in re.findall(r"<b>\s*([^<]+?)\s*</b>", line)
            if b.strip()
        ]
        if len(bolds) >= 3:
            d["slots"].append((bolds[0], bolds[1], bolds[2]))
    return d


def build_room_string(slots) -> str:
    """slots -> 前端教室字串，如 '二1,2(未排教室)'（同一天同教室的節次併在一起）。"""
    groups = {}  # (dayidx, room) -> [keys]
    order = []
    for day_name, sess_name, room in slots:
        di = WEEKDAY_NAME_TO_IDX.get(day_name)
        key = SESSION_NAME_TO_KEY.get(sess_name)
        if di is None or not key:
            continue
        g = (di, room)
        if g not in groups:
            groups[g] = []
            order.append(g)
        groups[g].append(key)
    parts = []
    for (di, room) in order:
        parts.append(f"{WEEKDAY_IDX_TO_CHAR[di]}{','.join(groups[(di, room)])}({room})")
    return " ".join(parts)


def build_classtime_from_slots(slots):
    """slots -> classTime[7]（index0=週一），較 ListTime 精確。"""
    buckets = ["", "", "", "", "", "", ""]
    for day_name, sess_name, _room in slots:
        di = WEEKDAY_NAME_TO_IDX.get(day_name)
        key = SESSION_NAME_TO_KEY.get(sess_name)
        if di is not None and key:
            buckets[di] += key
    return buckets


def crawl_details(s, by_id: dict):
    """逐課抓 SchdSbjDetail.php，補教室/班級/時數/大綱，並用更精確的時間覆蓋。"""
    ids = list(by_id.keys())
    n = len(ids)
    for i, cid in enumerate(ids):
        try:
            r = s.get(f"{BASE}/SchdSbjDetail.php", params={"SbjNo": cid}, timeout=30)
            r.encoding = r.apparent_encoding or "utf-8"
            d = parse_detail(r.text)
        except Exception:
            continue
        c = by_id[cid]
        if d["slots"]:
            c["room"] = build_room_string(d["slots"])
            ct = build_classtime_from_slots(d["slots"])
            if any(ct):
                # 與時段爬蟲(ListTime)的結果聯集，避免詳細頁漏列傍晚/實驗節次時把課洗掉
                key_order = "123456789ABCDE"
                merged = []
                for existing, add in zip(c["classTime"], ct):
                    chars = list(dict.fromkeys(list(existing) + list(add)))
                    chars.sort(key=lambda k: key_order.index(k) if k in key_order else 99)
                    merged.append("".join(chars))
                c["classTime"] = merged
        # 開課班級僅作為「系所/年級/班別」空白時的補值來源（多系歸屬改由逐班爬 ListClassCourse 提供）
        if d["klass_list"] and not (c["grade"] and c["class"]):
            dep, label = d["klass_list"][0]
            _, gr, kl = parse_class_label(label)
            c["department"] = c["department"] or dep
            c["grade"] = c["grade"] or gr
            c["class"] = c["class"] or kl
        if d["syllabus"]:
            c["url"] = d["syllabus"]
        if d["remark"] and not c["description"]:
            c["description"] = d["remark"]
        if d["hours"] or d["lab_hours"]:
            c["hours"] = d["hours"]
            c["labHours"] = d["lab_hours"]
        if (i + 1) % 100 == 0 or i + 1 == n:
            print(f"  [detail] {i + 1}/{n}")


# ----------------------------- 線上抓取 -----------------------------
def load_env() -> dict:
    env = {}
    p = HERE / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    env.update({k: v for k, v in os.environ.items() if k.startswith(("TTU_", "ACADEMIC", "SEMESTER"))})
    return env


def _session(env):
    import requests
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (TTU course planner, personal use)",
        "Cookie": env.get("TTU_COOKIE", ""),
        "Referer": f"{BASE}/seltop.php",
    })
    return s


CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def parse_class_label(text: str):
    """把班級名稱拆成 (系所, 年級, 班別)。
    例: '資訊工程學系一年級A班' -> ('資訊工程學系','1','A班')
        '資訊工程研究所碩士班一年級' -> ('資訊工程研究所','碩1','')
    """
    text = re.sub(r"\s+", "", text)
    grade = ""
    m = re.search(r"([一二三四五六七八九十])年級", text)
    if m:
        grade = str(CN_NUM[m.group(1)])
    prefix = ""
    if "碩士班" in text:
        prefix = "碩"
    elif "博士班" in text:
        prefix = "博"
    if prefix and grade:
        grade = prefix + grade
    elif prefix:
        grade = prefix
    km = re.search(r"([A-Za-z]班|不分班)", text)
    klass = km.group(1) if km else ""
    dept = re.split(r"[一二三四五六七八九十]年級|碩士班|博士班|學士班|不分班|[A-Za-z]班", text)[0]
    return dept, grade, klass


def _class_select_options(page_html: str):
    """從 ListClassCourse.php 頁面找出 SelClassNo(班級下拉) 的選項。"""
    for name, opts in re.findall(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>', page_html, re.S):
        if name != "SelClassNo":
            continue
        options = re.findall(r'<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>', opts, re.S)
        return [(v, _text(t)) for v, t in options if v]
    return []


def crawl_catalog_all(s) -> dict:
    """跑遍全校：每個系所 → 讀該系班級下拉 → 逐班抓，帶回 系所/年級/班別。
    回傳 {id: {'department','grade','class', ...course}}。
    """
    by_id = {}
    total_classes = 0
    for depno, depname in DEPARTMENTS.items():
        if depno == "00":
            continue
        try:
            # 先 POST 系所，讓該系的 SelClassNo 班級清單出現
            r = s.post(f"{BASE}/ListClassCourse.php", data={"SelDepNo": depno}, timeout=30)
            r.encoding = r.apparent_encoding or "utf-8"
            classes = _class_select_options(r.text)
        except Exception as e:
            print(f"  [catalog] {depname} 讀班級失敗: {e}")
            continue
        if not classes:
            continue
        total_classes += len(classes)
        for val, label in classes:
            _, grade, klass = parse_class_label(label)
            try:
                r = s.post(f"{BASE}/ListClassCourse.php",
                           data={"SelDepNo": depno, "SelClassNo": val}, timeout=30)
                r.encoding = r.apparent_encoding or "utf-8"
                for c in parse_mistab(r.text, department=depname):
                    mem = {
                        "department": depname, "grade": grade, "class": klass,
                        "compulsory": c["compulsory"],
                        "multipleCompulsory": c["multipleCompulsory"],
                    }
                    if c["id"] not in by_id:
                        c["grade"] = grade
                        c["class"] = klass
                        c["classMemberships"] = [mem]
                        by_id[c["id"]] = c
                    else:
                        by_id[c["id"]].setdefault("classMemberships", []).append(mem)
            except Exception as e:
                print(f"  [catalog] {depname}/{label} 失敗: {e}")
        print(f"  [catalog] {depname}: {len(classes)} 班，累計 {len(by_id)} 門")
    print(f"  [catalog] 全校完成：{total_classes} 班，{len(by_id)} 門（含系所/年級/班別）")
    return by_id


def crawl_catalog(s) -> dict:
    """依系所爬 ListClassCourse.php，回傳 {id: course}。"""
    by_id = {}
    for depno, depname in DEPARTMENTS.items():
        try:
            r = s.post(f"{BASE}/ListClassCourse.php", data={"SelDepNo": depno}, timeout=30)
            r.encoding = r.apparent_encoding or "utf-8"
            for c in parse_mistab(r.text, department=depname):
                by_id.setdefault(c["id"], c)
            print(f"  [catalog] {depno} {depname}: 累計 {len(by_id)} 門")
        except Exception as e:
            print(f"  [catalog] {depno} 失敗: {e}")
    # 通識/共同另抓（不一定歸在系所底下）
    for path, dep in [("ListGeneral.php", "通識教育中心"), ("ListUGRR.php", "共同/校訂必修")]:
        try:
            r = s.post(f"{BASE}/{path}", data={}, timeout=30)
            r.encoding = r.apparent_encoding or "utf-8"
            for c in parse_mistab(r.text, department=dep):
                by_id.setdefault(c["id"], c)
        except Exception as e:
            print(f"  [{path}] 失敗: {e}")
    return by_id


def crawl_time(s):
    """爬 ListTime.php 全部 (day×session)，SelDepNo=00 全校。
    回傳 (courses_by_id, hits)：
      courses_by_id: {id: course}  ← 全校有時段的課，當主目錄
      hits: {id: set((day,session))}
    """
    courses = {}
    hits = {}
    for day in DAYS:
        for sess in SESSIONS:
            try:
                r = s.post(f"{BASE}/ListTime.php",
                           data={"SelDepNo": "00", "SelDay": day, "SelSession": sess}, timeout=30)
                r.encoding = r.apparent_encoding or "utf-8"
                for c in parse_mistab(r.text):
                    courses.setdefault(c["id"], c)
                    hits.setdefault(c["id"], set()).add((day, sess))
            except Exception as e:
                print(f"  [time] d{day}s{sess} 失敗: {e}")
        print(f"  [time] 星期{day} 完成，累計全校 {len(courses)} 門有時段")
    return courses, hits


def write_outputs(courses: list[dict], year: str):
    stamp = datetime.datetime.now().strftime("%Y%m%d%H%M")
    d = OUT / year / stamp
    d.mkdir(parents=True, exist_ok=True)
    (d / "all.json").write_text(json.dumps(courses, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / year / "version.json").write_text(
        json.dumps({"latest": stamp, "history": {stamp: "自動產生"}}, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "version.json").write_text(
        json.dumps({"latest": year, "history": {year: "本學期"}}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] 寫入 {len(courses)} 門課 → {d/'all.json'}")


def run_online():
    env = load_env()
    if not env.get("TTU_COOKIE"):
        raise SystemExit("缺 TTU_COOKIE，請先 cp .env.example .env 並填入")
    year = env.get("ACADEMIC_YEAR", "1151")
    s = _session(env)

    # [1] 全校時段爬蟲當「主目錄」（含所有有排課時間的課，跨全系所）
    print("[1/3] 抓全校上課時段（主目錄）...")
    by_id, hits = crawl_time(s)

    # [2] 逐系所×逐班，補上 系所/年級/班別（也可能帶進無時段的課）
    print("[2/3] 逐系所逐班補系所/年級/班別 ...")
    enrich = crawl_catalog_all(s)
    for cid, ec in enrich.items():
        if cid in by_id:
            by_id[cid]["department"] = ec["department"] or by_id[cid]["department"]
            by_id[cid]["grade"] = ec["grade"] or by_id[cid]["grade"]
            by_id[cid]["class"] = ec["class"] or by_id[cid]["class"]
            # 逐班表的必選修/多選必修分類較準確，覆蓋之
            by_id[cid]["compulsory"] = ec["compulsory"]
            by_id[cid]["multipleCompulsory"] = ec["multipleCompulsory"]
            by_id[cid]["classMemberships"] = ec.get("classMemberships", [])
        else:
            by_id[cid] = ec  # 無時段但有列在班級表的課，補進來

    # [3] 把時段填回 classTime（先用 ListTime 的粗略結果）
    print("[3/4] 合併上課時間 ...")
    merge_class_time(by_id, hits)

    # [4] 逐課抓詳細頁：教室、開課班級、時數、課程大綱，並用更精確的時間覆蓋
    print(f"[4/4] 逐課抓詳細頁（共 {len(by_id)} 課，約需數分鐘）...")
    crawl_details(s, by_id)

    write_outputs(list(by_id.values()), year)


def run_samples():
    """離線驗證：解析 samples/*.html。"""
    sd = HERE / "samples"
    all_c = {}
    for f in sorted(sd.glob("*.html")):
        raw = f.read_bytes()
        try:
            h = raw.decode("utf-8")
        except UnicodeDecodeError:
            h = raw.decode("big5", "replace")
        cs = parse_mistab(h, department=f.stem)
        print(f"{f.name}: 解析出 {len(cs)} 門課")
        for c in cs:
            all_c.setdefault(c["id"], c)
    sample_out = sd / "_parsed.json"
    sample_out.write_text(json.dumps(list(all_c.values()), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"合計 {len(all_c)} 門（去重）→ {sample_out}")


def run_fixtime():
    """快速修補：只重抓全校時段(ListTime)，與最新既有資料的 classTime 聯集，
    補回詳細頁漏列的中午/傍晚等節次。不重爬 797 課的詳細頁。"""
    env = load_env()
    if not env.get("TTU_COOKIE"):
        raise SystemExit("缺 TTU_COOKIE，請先在 .env 填入")
    srcs = sorted(OUT.glob("*/*/all.json"))
    if not srcs:
        raise SystemExit("找不到既有資料，請先跑 python scrape.py")
    src = srcs[-1]
    year = src.parent.parent.name
    by_id = {c["id"]: c for c in json.loads(src.read_text(encoding="utf-8"))}
    s = _session(env)
    print("重抓全校時段(ListTime) 並與現有課表聯集 ...")
    _, hits = crawl_time(s)
    key_order = "123456789ABCDE"
    changed = 0
    for cid, slots in hits.items():
        c = by_id.get(cid)
        if not c:
            continue
        add = ["", "", "", "", "", "", ""]
        for day, session in slots:
            k = SESSION_TO_CHAR.get(session)
            if k and 1 <= day <= 7:
                add[day - 1] += k
        newct = []
        for existing, a in zip(c["classTime"], add):
            chars = list(dict.fromkeys(list(existing) + list(a)))
            chars.sort(key=lambda x: key_order.index(x) if x in key_order else 99)
            newct.append("".join(chars))
        if newct != c["classTime"]:
            c["classTime"] = newct
            changed += 1
    write_outputs(list(by_id.values()), year)
    print(f"聯集完成：{changed} 門課的上課時間有補齊")


def run_fixdepts():
    """快速修補：只重跑各系班級課表(ListClassCourse)，把「多系所歸屬(classMemberships)」
    併入最新既有資料，讓共同科目(如微積分)能出現在每個修課系所的系所課程清單。
    不重爬 797 課的詳細頁。"""
    env = load_env()
    if not env.get("TTU_COOKIE"):
        raise SystemExit("缺 TTU_COOKIE，請先在 .env 填入")
    srcs = sorted(OUT.glob("*/*/all.json"))
    if not srcs:
        raise SystemExit("找不到既有資料，請先跑 python scrape.py")
    src = srcs[-1]
    year = src.parent.parent.name
    by_id = {c["id"]: c for c in json.loads(src.read_text(encoding="utf-8"))}
    s = _session(env)
    enrich = crawl_catalog_all(s)
    if not enrich:
        raise SystemExit("讀不到任何班級（多半是 cookie 過期）——請重抓 cookie 再試")
    # 先清掉舊的歸屬（例如先前 --details 產生的全名版），再套用逐班爬的結果
    for c in by_id.values():
        c.pop("classMemberships", None)
    updated = added = 0
    for cid, ec in enrich.items():
        if cid in by_id:
            by_id[cid]["classMemberships"] = ec.get("classMemberships", [])
            # 補上原本空白的系所/年級/班別
            by_id[cid]["department"] = by_id[cid]["department"] or ec["department"]
            by_id[cid]["grade"] = by_id[cid]["grade"] or ec["grade"]
            by_id[cid]["class"] = by_id[cid]["class"] or ec["class"]
            updated += 1
        else:
            by_id[cid] = ec
            added += 1
    write_outputs(list(by_id.values()), year)
    print(f"完成：{updated} 門補上多系所歸屬，新增 {added} 門")


def run_details():
    """只對最新既有資料逐課重抓詳細頁：補教室、多系所歸屬(開課班級)、精確時間。
    跳過 ListTime/各系班級爬取（名額不會更新）。需有效 cookie。"""
    env = load_env()
    if not env.get("TTU_COOKIE"):
        raise SystemExit("缺 TTU_COOKIE，請先在 .env 填入")
    srcs = sorted(OUT.glob("*/*/all.json"))
    if not srcs:
        raise SystemExit("找不到既有資料，請先跑 python scrape.py")
    src = srcs[-1]
    year = src.parent.parent.name
    by_id = {c["id"]: c for c in json.loads(src.read_text(encoding="utf-8"))}
    s = _session(env)
    print(f"逐課重抓詳細頁（共 {len(by_id)} 課）...")
    crawl_details(s, by_id)
    write_outputs(list(by_id.values()), year)
    mem = sum(1 for c in by_id.values() if c.get("classMemberships"))
    print(f"完成：{mem} 門有多系所歸屬資料")


if __name__ == "__main__":
    if "--samples" in sys.argv:
        run_samples()
    elif "--fixtime" in sys.argv:
        run_fixtime()
    elif "--fixdepts" in sys.argv:
        run_fixdepts()
    elif "--details" in sys.argv:
        run_details()
    else:
        run_online()
