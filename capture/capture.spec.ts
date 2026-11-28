import { test, expect, type Page, type Locator, type CDPSession } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const PHONE = process.env.VIEW === "phone";
const OUT = process.env.CAPTURE_OUT ?? path.resolve("capture/out");
const SHOTS = path.join(OUT, PHONE ? "phone" : "desktop");
const FRAMES = path.join(OUT, "_frames");
const manifest: { file: string; who: string; caption: string }[] = [];
let n = 0;

test.use(
  PHONE
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 },
);

/* ---------- caption overlay + visible cursor (desktop video only) ---------- */
const overlay = () => {
  const css = `
  #cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;max-width:880px;width:calc(100% - 80px);
    background:rgba(20,22,40,.92);color:#fff;border-radius:14px;padding:14px 20px;font:500 19px/1.4 'IBM Plex Sans',system-ui,sans-serif;
    box-shadow:0 12px 40px rgba(0,0,0,.35);display:flex;gap:14px;align-items:center;pointer-events:none;transition:opacity .25s}
  #cap b{background:#B51834;border-radius:999px;padding:3px 12px;font-size:15px;white-space:nowrap}
  #cap:empty{display:none}
  #card{position:fixed;inset:0;z-index:2147483646;background:linear-gradient(135deg,#232A6B,#B51834);color:#fff;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:14px;font-family:'IBM Plex Sans',system-ui,sans-serif;text-align:center;pointer-events:none}
  #card h1{font-size:64px;margin:0;font-weight:700;letter-spacing:-1px}#card p{font-size:24px;margin:0;opacity:.92;max-width:900px}
  #card small{font-size:16px;opacity:.75;margin-top:18px}
  html:has(#card) #cur{display:none}
  #cur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(181,24,52,.35);
    border:2px solid #B51834;pointer-events:none;transition:transform .12s;left:-50px;top:-50px}
  #cur.down{transform:scale(.6);background:rgba(181,24,52,.7)}
  html.cap-hide #cap,html.cap-hide #cur,html.cap-hide #card{display:none!important}`;
  const mount = () => {
    if (document.getElementById("cap")) return;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const cap = document.createElement("div");
    cap.id = "cap";
    cap.innerHTML = sessionStorage.getItem("cap") ?? "";
    const cur = document.createElement("div");
    cur.id = "cur";
    const pos = sessionStorage.getItem("cur");
    if (pos) [cur.style.left, cur.style.top] = pos.split(",");
    document.body.append(cap, cur);
    addEventListener("mousemove", (e) => {
      cur.style.left = e.clientX + "px";
      cur.style.top = e.clientY + "px";
      sessionStorage.setItem("cur", `${cur.style.left},${cur.style.top}`);
    }, true);
    addEventListener("mousedown", () => cur.classList.add("down"), true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
  else mount();
};

/* ---------- sound cues: what happened when, on the video's clock (desktop only) ---------- */
type Cue = { t: number; kind: string; label?: string; dur?: number };
const cues: Cue[] = [];
const SUCCESS = new Set(["Confirmed", "Release", "Closed", "Found it", "Fresh MCQ", "Decision", "Checked", "Right, but unsure", "Her profile"]);
function cue(kind: string, label?: string, dur?: number) {
  if (!PHONE) cues.push({ t: Date.now() / 1000 - pausedFor, kind, label, dur });
}

const idle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});

async function say(page: Page, tag: string, text: string, dwell = 2200) {
  if (PHONE) return;
  cue(/^\d/.test(tag) ? "section" : SUCCESS.has(tag) ? "success" : "caption", tag, dwell / 1000);
  const html = `<b>${tag}</b><span>${text}</span>`;
  await page.evaluate((h) => {
    sessionStorage.setItem("cap", h);
    const el = document.getElementById("cap");
    if (el) el.innerHTML = h;
  }, html);
  await page.waitForTimeout(dwell);
}

async function card(page: Page, title: string, sub: string, small: string, ms = 3500) {
  if (PHONE) return;
  cue("card", title, ms / 1000);
  await page.evaluate(
    ([t, s, sm]) => {
      // A title card stands alone: clear the step caption so it doesn't sit on top of the card.
      sessionStorage.setItem("cap", "");
      const cap = document.getElementById("cap");
      if (cap) cap.innerHTML = "";
      document.getElementById("card")?.remove();
      const c = document.createElement("div");
      c.id = "card";
      c.innerHTML = `<h1>${t}</h1><p>${s}</p><small>${sm}</small>`;
      document.body.appendChild(c);
    },
    [title, sub, small],
  );
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.getElementById("card")?.remove());
}

/**
 * Saves a numbered, full-page screenshot (no caption or cursor in it). Phone pass keeps student screens only.
 * The viewport grows to the page height so fixed bars (sidebar, student tabs) sit where they belong;
 * the video skips those frames.
 */
async function shot(page: Page, slug: string, who: string, caption: string, opts: { full?: boolean } = {}) {
  if (PHONE && who !== "Student") return;
  await idle(page);
  const vp = page.viewportSize()!;
  const pauseStart = Date.now();
  paused = true;
  const scrollY = await page.evaluate(() => {
    document.documentElement.classList.add("cap-hide");
    return window.scrollY;
  });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  if ((opts.full ?? true) && h > vp.height) {
    await page.setViewportSize({ width: vp.width, height: Math.min(h, 6000) });
    await page.waitForTimeout(400);
  }
  const file = `${String(++n).padStart(2, "0")}_${slug}.png`;
  await page.screenshot({ path: path.join(SHOTS, file), animations: "disabled" });
  await page.setViewportSize(vp);
  await page.evaluate((y) => {
    document.documentElement.classList.remove("cap-hide");
    window.scrollTo(0, y);
  }, scrollY);
  await page.waitForTimeout(300);
  paused = false;
  pausedFor += (Date.now() - pauseStart) / 1000;
  manifest.push({ file, who, caption });
}

/** Moves the visible cursor to the element, then clicks, so the video shows where the click happens. */
async function click(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  if (!PHONE) {
    const box = await loc.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
      await page.waitForTimeout(250);
    }
  }
  cue("click");
  await loc.click();
}

async function type(page: Page, loc: Locator, text: string) {
  await click(page, loc);
  cue("type", undefined, text.length * 0.034);
  await loc.pressSequentially(text, { delay: PHONE ? 0 : 28 });
}

async function scrollTo(page: Page, loc: Locator) {
  cue("scroll");
  await loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await page.waitForTimeout(PHONE ? 100 : 900);
}

async function login(page: Page, name: RegExp) {
  // Phone pass: only the student screens are phone-sized; staff pages need the desktop nav.
  if (PHONE) await page.setViewportSize(/Mariam/.test(name.source) ? { width: 390, height: 844 } : { width: 1280, height: 720 });
  await page.goto("/login");
  await click(page, page.getByRole("button", { name }));
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function signOut(page: Page) {
  if (!(await page.getByRole("button", { name: "Sign out" }).first().isVisible())) await page.goto("/student/me");
  await click(page, page.getByRole("button", { name: "Sign out" }).first());
  await page.waitForURL(/\/login/);
}

/** A failing step is logged and skipped so one changed label doesn't lose the whole run. */
const failures: string[] = [];
async function step(page: Page, name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, `_fail_${PHONE ? "phone" : "desk"}_${name.replace(/\W+/g, "_")}.png`) }).catch(() => {});
  }
}

/* ---------- screencast → frames (desktop only) ---------- */
const frames: { file: string; t: number }[] = [];
let paused = false;
let pausedFor = 0;
async function startScreencast(page: Page): Promise<CDPSession> {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async (f) => {
    if (paused) {
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      return;
    }
    const file = path.join(FRAMES, `${String(frames.length).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: Date.now() / 1000 - pausedFor });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return cdp;
}

function writeConcat() {
  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - frames[i].t) : 3;
    lines.push(`file '${frames[i].file.replace(/\\/g, "/")}'`, `duration ${d.toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`);
  fs.writeFileSync(path.join(OUT, "frames.ffconcat"), lines.join("\n"));
}

test("GapMap submission capture", async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.addInitScript(overlay);

  // Warm the server and the seed before recording.
  await page.goto("/login");
  await page.goto("/");
  const cdp = PHONE ? null : await startScreencast(page);

  /* ===== Website ===== */
  await step(page, "landing", async () => {
    await card(page, "GapMap", "Students study, yet get low grades and don't know why.<br/>GapMap shows each student what they missed, and helps them fix it.", "AI Educathon 2026 · Genesis Team · demo data is fictional");
    await say(page, "Website", "GapMap: the lecturer marks on paper, the AI explains each lost mark from his own slides, and the student fixes it.", 3000);
    await shot(page, "landing", "Website", "Landing page: what GapMap does, for lecturers and students.");
    cue("scroll");
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1500);
    cue("scroll");
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1500);
  });

  await step(page, "login", async () => {
    await page.goto("/login");
    await say(page, "Sign in", "Demo accounts: one click for each role. Data is fictional and resets in one second.");
    await shot(page, "login", "Website", "Sign-in page with one-click demo accounts (lecturer, student, TA, coordinator) and Reset demo data.");
  });

  /* ===== Lecturer ===== */
  await step(page, "instructor-home", async () => {
    await login(page, /Dr\. Karim Nour/);
    await expect(page.getByRole("heading", { name: "Database Systems" })).toBeVisible();
    await say(page, "1 · Lecturer", "Dr. Karim Nour teaches Database Systems. He starts from his courses; he can create a course and enrol students by email.", 2800);
    await shot(page, "lecturer_courses", "Lecturer", "Lecturer home (Dr. Karim Nour): his courses, and a form to create a new course.");
  });

  await step(page, "course-lectures", async () => {
    await click(page, page.getByRole("link", { name: /Database Systems/ }).first());
    await page.waitForURL(/\/instructor\/courses\/[^/?]+/);
    const l4 = page.locator('section[aria-label="Lectures"] a').filter({ hasText: /4/ }).first();
    if (await l4.count()) await click(page, l4);
    await idle(page);
    await say(page, "Slides", "Every slide is tagged with the concept it teaches, so every lost mark can point back to a slide.", 2800);
    await shot(page, "course_lecture4_slide_tags", "Lecturer", "Lecture 4 slides: each slide is tagged with the concept it teaches; the AI suggests tags, the lecturer confirms them.");
    const confirm = page.getByRole("button", { name: "Confirm", exact: true }).first();
    if (await confirm.count()) {
      await scrollTo(page, confirm);
      await click(page, confirm);
      await idle(page);
      await say(page, "Confirmed", "He confirms the AI's tag on slide 12. Students can now be sent here from their feedback.");
      await shot(page, "course_slide_tag_confirmed", "Lecturer", "The lecturer confirms the AI-suggested concept tag.");
    }
    const concepts = page.getByRole("tab", { name: /Concepts/ });
    if (await concepts.count()) {
      await click(page, concepts);
      await idle(page);
      await say(page, "Concepts", "The course's concepts, each linked to the slides that teach it.", 1800);
      await shot(page, "course_concepts", "Lecturer", "Concepts of the course, each linked to its slides.");
    }
  });

  await step(page, "exams", async () => {
    await click(page, page.getByRole("link", { name: "Exams" }).first());
    await page.waitForURL(/\/instructor\/exams$/);
    await say(page, "Exams", "His exams: the paper midterm (written answers) and Quiz 2 (multiple choice).");
    await shot(page, "exams_list", "Lecturer", "Exams list: Midterm (handwritten answers) and Quiz 2 (MCQ), with questions, papers, fix chains and review.");
  });

  await step(page, "questions-rubric", async () => {
    await click(page, page.getByRole("link", { name: "Questions · Midterm exam" }));
    await idle(page);
    await say(page, "Rubric", "The model answer becomes criteria, each linked to a slide. The AI only drafts; the lecturer edits.");
    await shot(page, "midterm_questions_rubric", "Lecturer", "Midterm questions and rubric: each criterion is linked to the slide that teaches it.");
  });

  await step(page, "papers-upload", async () => {
    await page.goto("/instructor/exams");
    await click(page, page.getByRole("link", { name: "Papers · Midterm exam" }));
    await idle(page);
    await say(page, "Upload", "He marks the papers by hand, scans them and uploads the PDF. Names come from the upload form, never from the AI.");
    await shot(page, "midterm_papers_upload", "Lecturer", "Paper upload: the lecturer uploads scanned, hand-marked papers (PDF/images); GapMap reads his marks.");
  });

  await step(page, "review", async () => {
    await page.goto("/instructor/exams");
    await click(page, page.getByRole("link", { name: "Review · Midterm exam" }));
    await expect(page.getByRole("heading", { name: /Mariam Adel/ })).toBeVisible();
    await say(page, "2 · Review", "Mariam's Q3. On the left, her handwriting and his red-pen mark: 2/4. The AI never grades; it reads his mark.", 3200);
    await shot(page, "review_mariam_q3", "Lecturer", "Review queue, Mariam's Q3: scanned handwriting, the lecturer's own mark read from the paper, transcription with unclear words underlined, and the missing criterion.");
    const expl = page.locator('[data-tour="student-explanation"] summary');
    if (await expl.count()) {
      await scrollTo(page, expl);
      await click(page, expl);
      await say(page, "Explanation", "What Mariam will read: written only from his slide, with the page cited. Uncited text is flagged.", 3000);
      await shot(page, "review_explanation_cited", "Lecturer", "The student-facing explanation, written only from the lecturer's slide and citing the page; uncited text would be flagged.");
    }
  });

  await step(page, "approve-release", async () => {
    await click(page, page.getByRole("button", { name: "Approve & next" }));
    await expect(page.getByRole("button", { name: /Release \d+ to students/ })).toBeVisible();
    await say(page, "Approve", "Approved. Mariam still sees nothing until he releases it.");
    await shot(page, "review_approved_next", "Lecturer", "After Approve & next: the next answer opens; approved feedback waits until the lecturer releases it.");
    const bulk = page.getByRole("button", { name: /Approve \d+ for Q3/ });
    if (await bulk.count()) {
      await scrollTo(page, bulk);
      await say(page, "One click", "Clear marks, readable answers and cited explanations are approved for the whole question in one click. Only flagged ones are opened.", 3200);
      await shot(page, "review_bulk_approve_q3", "Lecturer", "Per-question approval: everything with a clear mark and a cited explanation is approved in one click; flagged answers (e.g. a smudged mark) are opened one by one.");
      await click(page, bulk);
      await page.waitForTimeout(800);
    }
    const release = page.getByRole("button", { name: /Release \d+ to students/ });
    await scrollTo(page, release);
    await click(page, release);
    await expect(page.getByRole("button", { name: /Release 0 to students/ })).toBeVisible();
    await say(page, "Release", "Released. Now the students see their feedback.");
    await shot(page, "review_released", "Lecturer", "Feedback released to students.");
  });

  await step(page, "chains", async () => {
    await page.goto("/instructor/exams");
    await click(page, page.getByRole("link", { name: /Fix chains · Quiz 2/ }));
    await expect(page.getByText("No student data reaches the AI.")).toBeVisible();
    await say(page, "3 · Fix chains", "Quiz 2 is multiple choice. Rules find the wrong options students chose; for each, the AI drafts 2 tap questions and a slide hint. No student data reaches the AI.", 3600);
    await shot(page, "quiz2_fix_chains_draft", "Lecturer", "Socratic-style fix chains for Quiz 2 (MCQ): for each wrong option students chose, the AI drafts two tap-to-answer questions and a slide hint, from the question and slides only.");
    await click(page, page.getByRole("button", { name: /Approve \d+ for Q3/ }));
    await expect(page.getByText("All chains approved").first()).toBeVisible();
    await say(page, "Approve", "He approves the chains for each question in one click.");
    await shot(page, "quiz2_fix_chains_approved", "Lecturer", "Chains approved per question by the lecturer.");
  });

  await step(page, "lecturer-out", async () => {
    await signOut(page);
  });

  /* ===== Student ===== */
  await step(page, "student-home", async () => {
    await login(page, /Mariam Adel/);
    await expect(page.getByText("Your next step")).toBeVisible();
    await say(page, "4 · Student", "Mariam signs in. One next step, not a wall of feedback.", 2800);
    await shot(page, "student_home_next_step", "Student", "Student home (Mariam): one clear next step, her progress by concept, and her released answers.");
  });

  await step(page, "student-answer", async () => {
    const ans = page.locator('section[aria-label="Your answers"] a').first();
    if (await ans.count()) {
      await scrollTo(page, ans);
      await click(page, ans);
      await idle(page);
      await say(page, "Her answer", "Her answer, his mark, what was missing, and the slide that explains it, one tap away.", 3000);
      await shot(page, "student_answer_feedback", "Student", "Answer feedback: her handwritten answer, the lecturer's mark, the missing part, and a page-cited explanation linked to the slide.");
      await page.goto("/student");
    }
  });

  await step(page, "followup", async () => {
    await click(page, page.getByRole("link", { name: "Answer one quick question" }));
    await idle(page);
    await say(page, "Ask why", "Two students can write the same answer for different reasons. One tap-to-answer question tells them apart.", 3000);
    await shot(page, "student_followup_question", "Student", "Follow-up question: tap-to-answer only (no free text goes to the AI), to tell a misconception from a slip.");
    await click(page, page.getByRole("button", { name: /could also share a number/ }));
    await expect(page.getByText(/A primary key must be unique/)).toBeVisible();
    await say(page, "Diagnosis", "Her tap shows a misconception: she thinks a key only needs to identify, not be unique.", 2800);
    await shot(page, "student_followup_result", "Student", "Her reply reveals the misconception, with the rule from the slide.");
  });

  await step(page, "activity", async () => {
    await click(page, page.getByRole("link", { name: "Start the activity" }));
    await expect(page.getByRole("heading", { name: "Try breaking the rule" })).toBeVisible();
    await say(page, "Activity", "She learns by experimenting, so she breaks the rule herself: two rows, same ID, update one.", 3000);
    await shot(page, "student_activity_experiment", "Student", "Targeted activity matched to her study profile: an experiment where she breaks the primary-key rule herself.");
    await type(page, page.getByLabel(/why did this happen/i), "Both rows have the same StudentID 1042, so the update changed both of them.");
    await click(page, page.getByRole("button", { name: "Check my explanation" }));
    await expect(page.getByText(/matched both rows/)).toBeVisible();
    await say(page, "Checked", "Her explanation is checked against the rule.");
    await shot(page, "student_activity_checked", "Student", "Her explanation is checked and confirmed.");
  });

  await step(page, "fresh-test", async () => {
    await click(page, page.getByRole("button", { name: /Take a fresh test/ }));
    await expect(page.getByText(/Course table/)).toBeVisible();
    await say(page, "Fresh test", "A new question on a new table, to check the gap is really closed.");
    await shot(page, "student_fresh_test", "Student", "Fresh test: a new question on the same concept with a different table.");
    await type(page, page.getByLabel("Your answer"), "CourseCode, because no two courses can share a code, and it never changes and can't be empty.");
    await click(page, page.locator("label").filter({ hasText: /^Sure$/ }));
    await say(page, "How sure?", "One optional tap: how sure is she? A rule compares it with the result. It is never sent to the AI.", 2800);
    await shot(page, "student_fresh_test_confidence", "Student", "Fresh test with the optional confidence tap (Sure / Not sure / Guessing), stored apart from the scan-reading confidence.");
    await click(page, page.getByRole("button", { name: "Submit answer" }));
    await expect(page.getByRole("heading", { name: /you've got it/ })).toBeVisible();
    await say(page, "Closed", "Partial → Met for Primary keys.", 2600);
    await shot(page, "student_fresh_test_passed", "Student", "Fresh test passed: the concept moves from Partial to Met.");
  });

  await step(page, "papers-fix", async () => {
    await click(page, page.getByRole("link", { name: "My papers" }).first());
    await idle(page);
    await say(page, "My papers", "Her papers across exams. Quiz 2 was multiple choice.");
    await shot(page, "student_my_papers", "Student", "My papers: every marked paper for the course.");
    await click(page, page.getByRole("link", { name: /Quiz 2/ }).first());
    await idle(page);
    await shot(page, "student_quiz2_paper", "Student", "Quiz 2 paper: her chosen options, scored by rules, with a 'Fix it in 2 taps' link on each wrong answer.");
    await click(page, page.getByRole("link", { name: /Fix it in 2 taps/ }).first());
    await expect(page.getByRole("heading", { name: /both called Mariam Adel/ })).toBeVisible();
    await say(page, "5 · Fix it", "The Socratic-style fix: she taps her way to the rule instead of reading it.", 2800);
    await shot(page, "student_fix_step1", "Student", "Fix it in 2 taps, step 1: a question about the wrong option she chose.");
    await click(page, page.getByRole("button", { name: "The one added first" }));
    await expect(page.getByText(/Hint from the slide/)).toBeVisible();
    await say(page, "Hint", "A wrong tap shows a hint from the slide, not the answer.", 2800);
    await shot(page, "student_fix_hint", "Student", "A wrong tap shows a hint taken from the lecturer's slide.");
    await click(page, page.getByRole("button", { name: "The database can't tell them apart" }));
    await page.waitForTimeout(600);
    await shot(page, "student_fix_step2", "Student", "Step 2 of the chain.");
    await click(page, page.getByRole("button", { name: "No two rows share its value" }));
    await expect(page.getByText(/The hint did its job/)).toBeVisible();
    await say(page, "Found it", "She found it herself. The page-cited explanation comes last.", 3000);
    await shot(page, "student_fix_done", "Student", "Chain finished: the page-cited explanation comes last, after she found the rule herself.");
    await click(page, page.getByRole("button", { name: /Take a fresh test/ }));
    await click(page, page.locator("label").filter({ hasText: "CourseCode" }).first());
    await click(page, page.locator("label").filter({ hasText: /^Not sure$/ }));
    await click(page, page.getByRole("button", { name: "Submit answer" }));
    await expect(page.getByRole("heading", { name: /you've got it/ })).toBeVisible();
    await say(page, "Fresh MCQ", "A new multiple-choice question from the bank, scored by rules.");
    await shot(page, "student_fresh_mcq_passed", "Student", "Fresh multiple-choice test from the question bank, scored by rules.");
    const unsure = page.getByText("Right, but you weren't sure");
    await expect(unsure).toBeVisible();
    await scrollTo(page, unsure);
    await say(page, "Right, but unsure", "She was right but not sure. A rule, not the AI, offers one more question so it sticks.", 3000);
    await shot(page, "student_confidence_right_but_unsure", "Student", "Right but unsure: a rule offers one more question on the same concept. Sure-but-wrong answers get a note that two ideas may be mixed up.");
  });

  await step(page, "student-tabs", async () => {
    for (const [label, slug, cap] of [
      ["Study plan", "student_study_plan", "Study plan: the activities left, one concept at a time."],
      ["Practice", "student_practice", "Practice: retrieval practice from the course question bank."],
      ["Ask", "student_ask_anonymous", "Ask: anonymous questions to the lecturer about a question or slide."],
      ["Me", "student_me_profile", "Me: study profile (5-tap check-in), progress and settings."],
    ] as const) {
      const link = page.getByRole("link", { name: label, exact: true }).first();
      if (!(await link.count())) continue;
      await click(page, link);
      await idle(page);
      await say(page, label, cap, 1800);
      await shot(page, slug, "Student", cap);
    }
  });

  await step(page, "checkin", async () => {
    await page.goto("/student/profile");
    await idle(page);
    await say(page, "Check-in", "A 5-question study check-in, all taps, scored by rules. It picks the kind of activity that suits her.", 2600);
    const pick = (q: RegExp, label: string) => click(page, page.getByRole("group", { name: q }).locator("label").filter({ hasText: new RegExp(`^${label}$`) }));
    await pick(/When you revise/, "Reread my slides or notes");
    await pick(/When you're stuck/, "Trying small changes myself");
    await pick(/When do you usually start/, "Skip");
    await say(page, "Skip", "Any question can be skipped. A skipped answer leaves no trait, and nothing is guessed in its place.", 2600);
    await pick(/How much time/, "30 min");
    await pick(/main goal/, "Raise my grade");
    await shot(page, "student_study_checkin", "Student", "5-question study check-in (habits, time, goals): tap-only, scored by rules, no AI. Every question has a Skip; there is also Reset my check-in.");
    await click(page, page.getByRole("button", { name: "Save my study profile" }));
    await page.waitForURL(/\/student\/me/);
    const evidence = page.getByRole("heading", { name: "What your profile is based on" });
    await scrollTo(page, evidence);
    await say(page, "Her profile", "What her profile rests on, each with its source and date: check-in, marks, fixes, fresh tests. Habits, not ability.", 3400);
    await shot(page, "student_profile_evidence", "Student", "What your profile is based on: each signal with its source and date (check-in, lecturer's marks, two-step fixes, follow-up replies, fresh tests with confidence). Habits, not ability; never sent to the AI.");
  });

  await step(page, "student-out", async () => {
    await signOut(page);
  });

  /* ===== Lecturer: class decision ===== */
  await step(page, "insights", async () => {
    await login(page, /Dr\. Karim Nour/);
    await click(page, page.getByRole("link", { name: "Class insights" }));
    await expect(page.getByRole("heading", { name: /Primary keys need another pass/ })).toBeVisible();
    await say(page, "6 · Class", "What to re-teach is computed: any concept 40%+ of the class misses, with the most common wrong idea.", 3200);
    await shot(page, "class_insights_reteach", "Lecturer", "Class insights: computed re-teach card (concepts missed by 40%+ of the class), the most common misconception, and the AI-quality tile.");
    await click(page, page.getByRole("button", { name: "Reteach next lecture" }));
    await expect(page.getByText(/Decision: Reteach in the next lecture/)).toBeVisible();
    await say(page, "Decision", "He decides: reteach primary keys in the next lecture.");
    await shot(page, "class_insights_decision", "Lecturer", "The lecturer records the decision: reteach in the next lecture.");
  });

  await step(page, "discussions", async () => {
    await click(page, page.getByRole("link", { name: "Discussions" }).first());
    await idle(page);
    await say(page, "Discussions", "Anonymous student questions, grouped by exam question.");
    await shot(page, "lecturer_discussions", "Lecturer", "Discussions: anonymous student questions about exam questions and slides.");
  });

  await step(page, "alerts", async () => {
    await click(page, page.getByRole("link", { name: "Alerts" }).first());
    await idle(page);
    await say(page, "Alerts", "Early support: Youssef passes overall but keeps missing foreign keys.", 2600);
    await shot(page, "lecturer_alerts", "Lecturer", "Early-support alerts: students who keep missing the same concept even when they pass overall.");
  });

  await step(page, "lecturer-out-2", async () => {
    await signOut(page);
  });

  await step(page, "coordinator", async () => {
    await login(page, /Dr\. Hany Fawzy/);
    await idle(page);
    await say(page, "Coordinator", "The programme coordinator sees class-level results only, never individual papers.", 2600);
    await shot(page, "coordinator_overview", "Coordinator", "Coordinator overview: class-level results across courses, CSV export, no individual papers.");
  });

  await step(page, "end", async () => {
    await page.goto("/");
    await card(page, "GapMap", "Lecturer marks → AI explains from his slides → student fixes it.", "The AI never grades · no student data reaches the AI · lecturer approves everything", 4000);
  });

  if (cdp) {
    await cdp.send("Page.stopScreencast");
    writeConcat();
    const t0 = frames[0]?.t ?? 0;
    fs.writeFileSync(path.join(OUT, "cues.json"), JSON.stringify(cues.map((c) => ({ ...c, t: +(c.t - t0).toFixed(3) })), null, 2));
  }
  fs.writeFileSync(path.join(SHOTS, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (failures.length) fs.writeFileSync(path.join(OUT, `_failures_${PHONE ? "phone" : "desktop"}.txt`), failures.join("\n"));
  console.log(`${manifest.length} screenshots, ${frames.length} frames, ${failures.length} failed steps`);
  for (const f of failures) console.log("  ✗ " + f);
});
