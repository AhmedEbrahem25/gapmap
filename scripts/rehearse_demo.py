"""Click through docs/demo-script.md in a headless browser, as the presenter will, and check each screen.

Where smoke_test.py checks the API, this checks the UI: the same buttons, the real file upload and
the row fixes from the script, in Edge or Chrome. It changes data, so run it after
`python -m app.seed --no-results` and reseed afterwards:

    python scripts/rehearse_demo.py                    # app on http://localhost:5173, API on :8000
    python scripts/rehearse_demo.py --web http://127.0.0.1:5173 --api http://127.0.0.1:8000

Needs a Chromium browser (Edge or Chrome) and `pip install httpx websockets`. Screenshots of each
step go to rehearsal/ (ignored by git).
"""

import argparse
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
import websockets

ROOT = Path(__file__).resolve().parents[1]
ERRORS_CSV = ROOT / "data" / "sample" / "exam1_results_with_errors.csv"
BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]
results: list[bool] = []


def demo_password() -> str:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("DEMO_PASSWORD="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("DEMO_PASSWORD", "demo1234")


def find_browser() -> str:
    for path in BROWSERS:
        if Path(path).exists():
            return path
    for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
        if found := shutil.which(name):
            return found
    sys.exit("No Edge or Chrome found. Install one, or edit BROWSERS in this script.")


class Page:
    """A tab driven over the Chrome DevTools Protocol."""

    def __init__(self, ws, web: str, out: Path):
        self.ws, self.n, self.web, self.out = ws, 0, web, out

    async def call(self, method, **params):
        self.n += 1
        my = self.n
        await self.ws.send(json.dumps({"id": my, "method": method, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == my:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})

    async def js(self, expr):
        r = await self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", "script error"))
        return r["result"].get("value")

    async def prepare(self):
        # Accept confirm() dialogs, type into React inputs, and find buttons and links by their text.
        await self.js("""window.confirm = () => true;
          window.__set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
            d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
          window.__byText = (text, scope = document, sel = 'button, a') => {
            const all = [...scope.querySelectorAll(sel)], t = e => e.textContent.trim();
            return all.find(e => t(e) === text) || all.find(e => t(e).startsWith(text)) || all.find(e => t(e).includes(text)); };
          true""")

    async def goto(self, path):
        await self.call("Page.navigate", url=self.web + path)
        await asyncio.sleep(2)
        await self.prepare()

    async def login_as(self, api: str, email: str, password: str):
        res = httpx.post(f"{api}/api/auth/login", json={"email": email, "password": password})
        res.raise_for_status()
        await self.call("Page.navigate", url=f"{self.web}/login")
        await asyncio.sleep(1.5)
        await self.js(f"localStorage.setItem('gapmap.token', {json.dumps(res.json()['access_token'])})")
        await self.goto("/")

    async def click(self, text, scope="document"):
        found = await self.js(
            f"(() => {{ const e = __byText({json.dumps(text)}, {scope}); if (!e) return false; e.click(); return true; }})()"
        )
        if not found:
            raise RuntimeError(f"no button or link {text!r}")
        await asyncio.sleep(1.2)

    async def text(self) -> str:
        return await self.js("document.body.innerText")

    async def wait_for(self, needle, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            if needle in await self.text():
                return
            await asyncio.sleep(0.4)
        raise RuntimeError(f"{needle!r} never appeared")

    async def shot(self, name):
        data = (await self.call("Page.captureScreenshot", format="png"))["data"]
        (self.out / f"{name}.png").write_bytes(base64.b64decode(data))


async def step(name, coro):
    try:
        detail = await coro
        results.append(True)
        print(f"PASS  {name}" + (f"  ({detail})" if detail else ""))
    except Exception as exc:  # noqa: BLE001 - report the failure, then stop
        results.append(False)
        print(f"FAIL  {name}  ({exc})")
        raise


async def rehearse(p: Page, api: str, password: str):
    row = "(n) => [...document.querySelectorAll('tbody tr')].find(tr => tr.firstElementChild?.textContent.trim() === String(n))"

    # Window 1: instructor
    await p.login_as(api, "instructor@gapmap.test", password)

    async def course():
        await p.click("Software Engineering")
        await p.wait_for("Lecture materials")
        await p.shot("1-course")
    await step("1. course page", course())

    async def upload():
        await p.click("Import results")
        await p.wait_for("Upload CSV or Excel")
        doc = await p.call("DOM.getDocument")
        node = await p.call("DOM.querySelector", nodeId=doc["root"]["nodeId"], selector="input[type=file]")
        await p.call("DOM.setFileInputFiles", nodeId=node["nodeId"], files=[str(ERRORS_CSV)])
        await p.wait_for("3 to fix")
        await p.shot("2-import")
        return "3 to fix, 1 with warnings"
    await step("2. upload the results file with errors", upload())

    async def fix():
        await p.click("To fix (3)")
        await p.js(f"({row})(30).querySelector('button').click()")
        await asyncio.sleep(0.5)
        await p.js(f"(() => {{ const i = ({row})(30).querySelectorAll('input'); __set(i[2], 'B'); __set(i[3], '1'); }})()")
        await p.js(f"__byText('Save', ({row})(30)).click()")
        await asyncio.sleep(1.5)
        await p.js(f"({row})(62).querySelector('button').click()")
        await asyncio.sleep(0.5)
        await p.js(f"__set(({row})(62).querySelectorAll('input')[1], 'Q7')")
        await p.js(f"__byText('Save', ({row})(62)).click()")
        await asyncio.sleep(1.5)
        await p.js(f"__byText('Delete', ({row})(86)).click()")
        await asyncio.sleep(1.5)
        await p.wait_for("To fix (0)")
        await p.click("Warnings (1)")
        await p.shot("3-warnings")
        await p.click("Approve results")
        await p.wait_for("Approved")
        return "lines 30 and 62 fixed, 86 deleted, approved"
    await step("3. fix the rows and approve", fix())

    async def analysis():
        await p.click("← Back to course")
        await p.click("Run analysis")
        await p.wait_for("Re-run analysis")
        await p.click("View results")
        await p.click("STU001")
        await p.wait_for("Scrum Roles")
        await p.shot("4-report")
        assert (await p.text()).count("33.3%") >= 2, "STU001 should have 33.3% on Agile and Scrum Roles"
        return "STU001: 33.3% on Agile and Scrum Roles"
    await step("4. run the analysis and open STU001", analysis())

    async def slide():
        await p.click("The Scrum Master")
        await p.wait_for("page 7")
        await p.shot("5-slide")
        return "the real file, page 7"
    await step("5. open the real slide", slide())

    # Window 2: student
    await p.login_as(api, "stu001@gapmap.test", password)

    async def plan():
        await p.click("Software Engineering")
        await p.click("Open my report")
        await p.click("Open my plan")
        await p.wait_for("Recovery plan")
        await p.click("Mark as reviewed")
        await p.click("Start practice")
        await p.wait_for("Practice:")
        await p.js("document.querySelector('input[type=radio]').click()")
        await asyncio.sleep(0.3)
        await p.click("Check")
        await p.shot("6-practice")
        assert "page" in await p.text(), "practice feedback should link to its slide"
        await p.click("Done practising")
        return "slide reviewed, practice feedback links to the slide"
    await step("6. plan, mark reviewed, practice", plan())

    async def retest():
        await p.click("Take the retest")
        await p.wait_for("Submit retest")
        n = await p.js("""(() => { const names = [...new Set([...document.querySelectorAll('input[type=radio]')].map(r => r.name))];
            names.forEach(n => document.querySelector(`input[name="${n}"]`).click()); return names.length; })()""")
        await asyncio.sleep(0.5)
        await p.click("Submit retest")
        await p.wait_for("Retest results")
        await p.shot("7-retest")
        assert "points" in await p.text(), "before/after should be in points"
        return f"{n} questions, before/after per concept"
    await step("7. retest and before/after", retest())

    # Window 1 again
    await p.login_as(api, "instructor@gapmap.test", password)

    async def analytics():
        await p.click("Software Engineering")
        await p.click("Class analytics")
        await p.wait_for("Suggested for re-teaching")
        await p.shot("8-analytics")
        t = await p.text()
        assert "73.3%" in t and "17 of 20" in t, "Scrum Roles should be flagged with its evidence"
        return "Scrum Roles: 73.3% of 60 answers wrong, 17 of 20 students"
    await step("8. class analytics", analytics())


async def main(args):
    out = ROOT / "rehearsal"
    out.mkdir(exist_ok=True)
    profile = tempfile.mkdtemp(prefix="gapmap-rehearsal-")
    browser = subprocess.Popen(
        [find_browser(), "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--remote-debugging-port={args.port}",
         f"--user-data-dir={profile}", "--no-first-run", "--disable-extensions",
         "--disable-features=WebContentsForceDark", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        pages = []
        for _ in range(60):
            try:
                pages = [t for t in httpx.get(f"http://127.0.0.1:{args.port}/json/list").json() if t["type"] == "page"]
                if pages:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
        async with websockets.connect(pages[0]["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
            p = Page(ws, args.web.rstrip("/"), out)
            await p.call("Page.enable")
            await p.call("DOM.enable")
            await p.call("Emulation.setDeviceMetricsOverride", width=args.width, height=800, deviceScaleFactor=1, mobile=False)
            await p.call("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": "light"}])
            await rehearse(p, args.api.rstrip("/"), demo_password())
    finally:
        browser.terminate()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--web", default="http://localhost:5173")
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--width", type=int, default=1280, help="window width; try 1024 for an old projector")
    parser.add_argument("--port", type=int, default=9335, help="browser debugging port")
    try:
        asyncio.run(main(parser.parse_args()))
    except Exception:  # noqa: BLE001 - the failing step was already printed
        pass
    print(f"\n{sum(results)} of 8 demo steps passed in the UI. Reseed before presenting: python -m app.seed --no-results")
    sys.exit(0 if len(results) == 8 and all(results) else 1)
