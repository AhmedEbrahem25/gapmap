"""End-to-end smoke test of the demo journey against a running GapMap API.

Run it after `python -m app.seed --no-results` (it imports the results itself):

    python scripts/smoke_test.py                      # http://localhost:8000
    python scripts/smoke_test.py http://host:8000

Uses the demo accounts and DEMO_PASSWORD from .env (default demo1234). Exits non-zero on the
first failed step. It changes data: reseed afterwards before presenting.
"""

import io
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
BASE = ORIGIN + "/api"


def demo_password() -> str:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("DEMO_PASSWORD="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("DEMO_PASSWORD", "demo1234")


PASSWORD = demo_password()
client = httpx.Client(base_url=BASE, timeout=120)
step_no = 0


def step(name: str, ok: bool, detail: str = "") -> None:
    global step_no
    step_no += 1
    print(f"{'PASS' if ok else 'FAIL'}  {step_no:>2}. {name}" + (f"  ({detail})" if detail else ""))
    if not ok:
        sys.exit(1)


def login(email: str) -> dict[str, str]:
    res = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    step(f"login {email}", res.status_code == 200, str(res.status_code))
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def main() -> None:
    step("health", client.get("/health").json() == {"status": "ok"})
    teacher = login("instructor@gapmap.test")
    student = login("stu001@gapmap.test")

    course = client.get("/courses", headers=teacher).json()[0]
    exam = client.get(f"/courses/{course['id']}/exams", headers=teacher).json()[0]
    step("seeded course and exam", course["code"] == "SE301" and exam["question_count"] == 9)

    # Import with errors -> fix -> approve (plan storyboard steps 2-3)
    data = (ROOT / "data" / "sample" / "exam1_results_with_errors.csv").read_bytes()
    res = client.post(
        f"/exams/{exam['id']}/imports", headers=teacher,
        files={"file": ("exam1_results_with_errors.csv", data, "text/csv")},
    )
    batch = res.json()
    step("upload results with errors", res.status_code == 201 and batch["invalid_rows"] == 3,
         f"{batch.get('invalid_rows')} to fix, {batch.get('warning_rows')} warnings")
    blocked = client.post(f"/exams/{exam['id']}/analyze", headers=teacher)
    step("analysis blocked before approval (TC-19)", blocked.status_code == 409)

    rows = {r["row_number"]: r for r in batch["rows"] if r["errors"]}
    for line, patch in ((30, {"answer": "B", "score": 1}), (62, {"question_code": "Q7"})):
        batch = client.patch(f"/imports/{batch['id']}/rows/{rows[line]['id']}", json=patch, headers=teacher).json()
    batch = client.delete(f"/imports/{batch['id']}/rows/{rows[86]['id']}", headers=teacher).json()
    step("fix two rows, delete the duplicate", batch["invalid_rows"] == 0 and batch["total_rows"] == 180)
    res = client.post(f"/imports/{batch['id']}/approve", headers=teacher)
    step("approve results", res.status_code == 200 and res.json()["status"] == "approved")

    # Analysis (step 4)
    summary = client.post(f"/exams/{exam['id']}/analyze", headers=teacher).json()
    step("run analysis", summary["students"] == 20 and summary["recovery_plans"] > 0,
         f"{summary['students']} students, {summary['recovery_plans']} plans")
    report = client.get(f"/students/me/reports/{exam['id']}", headers=student).json()
    concepts = {c["name"]: c for c in report["concepts"]}
    step("STU001 weak in Agile and Scrum Roles",
         concepts["Agile"]["status"] == "weak" and concepts["Scrum Roles"]["status"] == "weak"
         and concepts["Requirements"]["status"] == "ok")
    slide = concepts["Scrum Roles"]["slides"][0]
    page = client.get(f"/materials/{slide['material_id']}/pages/{slide['page_number']}", headers=student)
    image = httpx.get(ORIGIN + page.json()["image_url"], headers=student)  # image_url already starts with /api
    step("slide link opens the real page and image (step 5)",
         page.status_code == 200 and image.headers.get("content-type") == "image/png",
         f"{slide['filename']} p.{slide['page_number']}")

    # Recovery plan, practice, retest (steps 6-7)
    plan = client.get(f"/recovery-plans/{report['recovery_plan_id']}", headers=student).json()
    step("recovery plan weakest first", [c["name"] for c in plan["concepts"]] == ["Agile", "Scrum Roles"])
    task = plan["concepts"][0]["tasks"][0]
    step("mark slide reviewed", client.post(f"/recovery-tasks/{task['id']}/complete", headers=student).status_code == 204)
    practice = client.get(f"/concepts/{plan['concepts'][0]['concept_id']}/practice", headers=student).json()
    check = client.post(f"/practice/{practice[0]['id']}/check", json={"answer": "A"}, headers=student).json()
    step("practice feedback with source", "correct" in check and check["source"] is not None)
    explanation = client.get(f"/concepts/{plan['concepts'][0]['concept_id']}/explanation", headers=student).json()
    step("explanation endpoint answers", explanation["status"] in ("ready", "unavailable"),
         explanation["status"] + (f": {explanation['message']}" if explanation.get("message") else ""))
    retest = client.post("/retests", json={"recovery_plan_id": plan["id"]}, headers=student).json()
    answers = {q["id"]: q["options"][0]["key"] for q in retest["questions"]}
    result = client.post(f"/retests/{retest['id']}/submit", json={"answers": answers}, headers=student).json()
    step("retest submitted with before/after", len(result["concepts"]) == 2 and "gain_points" in result["concepts"][0],
         ", ".join(f"{c['name']} {c['gain_points']:+g} pts" for c in result["concepts"]))

    # Class analytics and audit (step 8)
    analytics = client.get(f"/courses/{course['id']}/analytics", headers=teacher).json()
    step("Scrum Roles suggested for re-teaching", analytics["reteach"][0]["name"] == "Scrum Roles",
         analytics["reteach"][0]["evidence"][0])
    audit = client.get(f"/courses/{course['id']}/audit-log", headers=teacher).json()
    step("audit log records the approval and analysis",
         {"import.approved", "exam.analyzed", "import.row_corrected"} <= {e["action"] for e in audit})

    # Concepts and slides (FR-09, FR-10): add a concept, approve its best suggestion, then clean up
    res = client.post(f"/courses/{course['id']}/concepts", headers=teacher,
                      json={"name": "Product Backlog", "description": "Who owns and orders the backlog"})
    concept = res.json()
    suggestions = client.get(f"/concepts/{concept['id']}/slide-suggestions", headers=teacher).json()
    best = suggestions[0]["slide"]
    approved = client.put(f"/concepts/{concept['id']}/slides/{best['slide_chunk_id']}", headers=teacher).json()
    step("create a concept and approve a suggested slide",
         res.status_code == 201 and suggestions[0]["score"] > 0 and len(approved["slides"]) == 1,
         f"page {best['page_number']}, matched {', '.join(suggestions[0]['matched_terms'])}")
    client.delete(f"/concepts/{concept['id']}/slides/{best['slide_chunk_id']}", headers=teacher)
    gone = client.delete(f"/concepts/{concept['id']}", headers=teacher)
    step("remove the slide and delete the unused concept", gone.status_code == 204)

    # Access rules
    other = client.get(f"/exams/{exam['id']}/students/{report['student_id']}/report",
                       headers=login("stu002@gapmap.test"))
    step("student cannot open another student's report (TC-02)", other.status_code == 403)

    # Word upload
    try:
        import docx  # dev dependency
    except ImportError:
        print("SKIP  Word upload (pip install python-docx)")
    else:
        d = docx.Document()
        d.add_heading("Smoke test", 1)
        d.add_paragraph("Uploaded by scripts/smoke_test.py")
        buf = io.BytesIO()
        d.save(buf)
        res = client.post(f"/courses/{course['id']}/materials", headers=teacher,
                          files={"file": ("smoke.docx", buf.getvalue(), "application/octet-stream")})
        step("Word upload processed", res.status_code == 201 and res.json()["status"] == "ready")

    print(f"\nAll {step_no} steps passed. Reseed before presenting: python -m app.seed --no-results")


if __name__ == "__main__":
    main()
