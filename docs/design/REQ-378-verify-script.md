---
id: REQ-378-verify-script
title: "REQ-378 検査スクリプト（検証計画の付属資料）"
status: draft
change_kind: document
related_pbi: REQ-378
test_plan: docs/design/REQ-378-test-plan.md
---

# REQ-378 検査スクリプト（検証計画の付属資料）

`docs/design/REQ-378-test-plan.md` の機械検査に使う読み取り専用スクリプト。独立した検証者がリポジトリ外の一時ファイル（`$S`）に保存して使う。リポジトリには置かない（コード資産を増やさない）。

使い方（cwd=操作ルート、`export PYTHONIOENCODING=utf-8`）: `python -I $S MODE [--file F] [--stage 1|2] [--allow-forward ID]`。MODE は structure／unapproved／numbers／refs／wording／links／encoding／scope。`numbers`・`refs` は `git show HEAD:docs/specs/SPEC_COMMON.md` との差分の追加行を検査する（HEAD がベースライン）。`encoding` は引数にファイルを列挙する。

```python
"""REQ-378 document checks (read-only). Usage: python -I req378_check.py MODE [--file F] [--stage 1|2]"""
import re
import subprocess
import sys
import difflib
from pathlib import Path

SPEC = "docs/specs/SPEC_COMMON.md"
IDS = [f"MUI-{n:02d}" for n in range(2, 12)]


def arg(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if name in a else default


FILE = Path(arg("--file", SPEC))
STAGE = int(arg("--stage", "2"))


def text(p):
    return Path(p).read_text(encoding="utf-8")


def base_lines():
    return subprocess.run(["git", "show", f"HEAD:{SPEC}"], capture_output=True, encoding="utf-8", check=True).stdout.splitlines()


def added_lines():
    old, new = base_lines(), text(FILE).splitlines()
    sm = difflib.SequenceMatcher(None, old, new, autojunk=False)
    out = []
    for tag, _, _, j1, j2 in sm.get_opcodes():
        if tag in ("insert", "replace"):
            out += new[j1:j2]
    return out


def section(lines, start_re, stop_re):
    out, on = [], False
    for ln in lines:
        if on and re.match(stop_re, ln):
            break
        if re.match(start_re, ln):
            on = True
        if on:
            out.append(ln)
    return out


def cells(row):
    return [c.strip() for c in row.strip().strip("|").split("|")]


fails = []


def check(ok, msg):
    print(("OK   " if ok else "FAIL ") + msg)
    if not ok:
        fails.append(msg)


STOP16 = r"^(## |### (?!1-6\. ))"
STOP56 = r"^(---$|## |### (?!5-6\. ))"

mode = sys.argv[1]
lines = text(FILE).splitlines() if mode not in ("encoding", "scope") else []

if mode == "structure":  # AC-1, AC-3
    s16 = section(lines, r"^### 1-6\. ", STOP16)
    check(bool(s16), "section '### 1-6.' exists")
    for k in range(1, 7):
        check(any(l.startswith(f"#### 1-6-{k}. ") for l in s16), f"heading 1-6-{k} exists")
    rows = [l for l in s16 if l.startswith("| MUI-")]
    found = [cells(r)[0] for r in rows]
    check(found == IDS, f"rule rows are exactly {IDS[0]}..{IDS[-1]} in order (found {found})")
    for r in rows:
        c = cells(r)
        check(len(c) == 6 and all(c), f"{c[0]}: 6 non-empty cells (ID/theme/rule/screens/PBIs/status)")
        if len(c) == 6:
            check(c[5] in ("導入前", "導入済み"), f"{c[0]}: status is 導入前|導入済み (got {c[5]!r})")
            check(re.search(r"REQ-3\d\d", c[4]) is not None, f"{c[0]}: applicable PBI id present")
    themes = ["スクロール", "固定操作", "アクション配置", "シート／画像", "操作領域", "表示階層", "情報階層", "入口の一貫性", "ジェスチャー", "複数選択"]
    body = "\n".join(s16)
    for t in themes:
        check(t in body, f"theme '{t}' present")
    check("Close／Cancel" in body and "Edit／Save" in body, "left=Close/Cancel, right=Edit/Save wording present")
    check("全文" in body, "full-text confirmation path wording present (MUI-08)")
    if STAGE >= 2:
        s56 = section(lines, r"^### 5-6\. ", STOP56)
        check(bool(s56), "section '### 5-6.' exists")
        b = "\n".join(s56)
        for kw in ("上部", "下部", "×", "選択中", "ボトムナビ", "デスクトップ", "導入前"):
            check(kw in b, f"5-6 contains '{kw}'")

elif mode == "unapproved":  # AC-5
    s = section(lines, r"^#### 1-6-5\. ", r"^(#{1,4} )(?!1-6-5\. )")
    rows = [l for l in s if l.startswith("|")]
    for name in ("TagChipEditor", "ImageCarousel", "MultiSelectToolbar", "TagSetFormFields"):
        r = [x for x in rows if name in cells(x)[0]]
        check(len(r) == 1, f"{name}: exactly one row")
        if r:
            c = cells(r[0])
            check(len(c) == 5 and all(c) and c[4] == "未承認", f"{name}: 5 non-empty cells and status 未承認")

elif mode == "numbers":  # AC-4
    add = added_lines()
    pat = re.compile(r"(?<![0-9])(42|320|72|54|3|8)px|2/2/1|2／2／1")
    hits = [l for l in add if pat.search(l)]
    check(not hits, f"no screen-specific value tokens in added lines ({len(add)} added lines scanned)")
    for h in hits:
        print("   hit:", h[:120])
    s = "\n".join(section(lines, r"^#### 1-6-4\. ", r"^(#{1,4} )(?!1-6-4\. )"))
    check("共通トークン" in s and "REQ-37" in s, "1-6-4 states values are not common tokens and belong to screen PBIs")

elif mode == "refs":  # reference resolution for added lines
    heads = set()
    for l in lines:
        m = re.match(r"^#{2,4} (\d+(?:-\d+)*)\.", l)
        if m:
            heads.add(m.group(1))
    allow = set((arg("--allow-forward", "") or "").split(",")) - {""}
    added = added_lines()
    for l in added:
        for m in re.finditer(r"§(\d+(?:-\d+)*)", l):
            check(m.group(1) in heads or m.group(1) in allow, f"§{m.group(1)} resolves")
    for rid in sorted(set(re.findall(r"MUI-\d\d", "\n".join(added)))):
        check(rid in IDS, f"{rid} is a defined rule id")

elif mode == "wording":  # AC-3: no present-fact wording for rules not yet introduced
    secs = section(lines, r"^### 1-6\. ", STOP16) + section(lines, r"^### 5-6\. ", STOP56)
    bad = re.compile(r"実装済み|既に|すでに|現在は|現状は|現在、")
    hits = [l for l in secs if bad.search(l)]
    check(bool(secs) and not hits, "no present-fact wording (実装済み/既に/すでに/現在は/現状は/現在、) in 1-6 and 5-6")
    for h in hits:
        print("   hit:", h[:120])

elif mode == "links":
    def slug(h):
        h = re.sub(r"[`*_~]", "", h.strip().lower())
        return re.sub(r"[^\w\- ]", "", h, flags=re.UNICODE).replace(" ", "-")

    def anchors(p):
        res = set()
        for l in text(p).splitlines():
            m = re.match(r"^#{1,6}\s+(.*)$", l)
            if m:
                res.add(slug(m.group(1)))
        return res

    allf = [FILE] + [Path("docs/specs") / n for n in ("SPEC_GENERATE.md", "SPEC_HISTORY.md", "SPEC_LORAS.md", "SPEC_TAGS.md")]
    known = "REQ-347-T10.md"  # pre-existing baseline defect in SPEC_GENERATE.md (out of scope)
    n = 0
    for p in allf:
        fence = False
        for ln, line in enumerate(text(p).splitlines(), 1):
            if line.lstrip().startswith("```"):
                fence = not fence
                continue
            if fence:
                continue
            for m in re.finditer(r"(?<!!)\[[^\]]*\]\(([^)\s]+)\)", line):
                t = m.group(1)
                if re.match(r"^[a-z]+:", t, re.I):
                    continue
                n += 1
                path, _, frag = t.partition("#")
                dest = p if path == "" else p.parent / path
                if not dest.exists():
                    check(known in t and p.name == "SPEC_GENERATE.md", f"{p.name}:{ln} link target exists: {t}")
                elif frag and dest.suffix == ".md":
                    a = anchors(dest)
                    check(slug(frag) in a or frag in a, f"{p.name}:{ln} anchor resolves: {t}")
    print(f"links_checked={n} (known baseline defect tolerated: SPEC_GENERATE.md -> {known})")

elif mode == "encoding":
    for f in sys.argv[2:]:
        if f.startswith("--"):
            break
        b = Path(f).read_bytes()
        check(not b.startswith(b"\xef\xbb\xbf"), f"{f}: no BOM")
        check(b"\r" not in b, f"{f}: LF only")
        try:
            b.decode("utf-8")
            ok = True
        except UnicodeDecodeError:
            ok = False
        check(ok and b.endswith(b"\n"), f"{f}: valid UTF-8 and ends with newline")

elif mode == "scope":  # AC-8
    out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"], capture_output=True, encoding="utf-8", check=True).stdout.splitlines()
    ok_re = re.compile(
        r"^(docs/specs/SPEC_COMMON\.md|docs/design/REQ-378(-test-plan|-verify-script)?\.md|docs/backlog/task/(active|archive)/REQ-378-T\d+\.md"
        r"|docs/backlog/pbi/(active|archive)/REQ-378\.md|docs/design/mobile-ui-redesign/.*|docs/logs/.*|docs/backlog/ba-audit/.*)$"
    )
    for l in out:
        path = l[3:].strip().strip('"')
        check(bool(ok_re.match(path)), f"changed path allowed: {path}")

else:
    print("unknown mode")
    sys.exit(2)

print("RESULT:", "FAIL" if fails else "PASS", f"({len(fails)} failing check(s))")
sys.exit(1 if fails else 0)
```
