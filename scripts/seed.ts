/**
 * Resets the local database and loads the GapMap demo data.
 * Run with:  npm run db:seed
 */
import type { SqlJsStatic } from "sql.js";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import * as s from "../src/lib/db/schema";
import { loadSqlJs, openDatabase } from "../src/lib/db/sqlite";
import { explainFromSlide, followupChoicesFor } from "../src/lib/ai/fallback";
import {
  DEMO_PASSWORD,
  conceptDefs,
  lectureDefs,
  questionDefs,
  studentDefs,
  wrapHandwriting,
  pkExperiment,
  type ConceptKey,
} from "./seed-data";

const id = (p: string) => `${p}_${nanoid(10)}`;

/** Synchronous once sql.js is loaded, so the app can seed an empty database on first request. */
export function seed(SQL: SqlJsStatic, dbFile = process.env.DATABASE_PATH ?? "data/gapmap.db") {
  const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), dbFile);
  for (const suffix of ["", "-wal", "-shm", ".tmp"]) fs.rmSync(file + suffix, { force: true });
  const handle = openDatabase(SQL, file, path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle"));
  const db = handle.db;

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  db.transaction((tx) => {
    /* ── Organisation & people ── */
    const uni = { id: id("uni"), name: "Demo University", plan: "pilot" };
    tx.insert(s.universities).values(uni).run();
    const company = { id: id("co"), name: "Nile Data Labs (demo)", website: null };
    tx.insert(s.companies).values(company).run();

    const staff = {
      instructor: { id: id("usr"), email: "dr.karim@gapmap.demo", name: "Dr. Karim Nour", role: "instructor" as const, title: "Lecturer, Faculty of Computing" },
      ta: { id: id("usr"), email: "ta.nada@gapmap.demo", name: "Nada Lotfy", role: "ta" as const, title: "Teaching assistant" },
      coordinator: { id: id("usr"), email: "coordinator@gapmap.demo", name: "Dr. Hany Fawzy", role: "coordinator" as const, title: "Programme coordinator" },
      company: { id: id("usr"), email: "hr@niledata.demo", name: "Reem Saleh", role: "company" as const, title: "Talent partner", companyId: company.id },
      admin: { id: id("usr"), email: "admin@gapmap.demo", name: "GapMap Admin", role: "admin" as const, title: "Platform admin" },
    };
    for (const u of Object.values(staff)) {
      tx.insert(s.users).values({ ...u, universityId: uni.id, passwordHash: hash }).run();
    }

    const students = studentDefs.map(([name, section, optIn, overrides], i) => {
      const first = name.split(" ")[0]!.toLowerCase();
      const last = name.split(" ")[1]!.toLowerCase();
      const email = i === 0 ? "mariam@gapmap.demo" : `${first}.${last}@student.gapmap.demo`;
      const row = { id: id("usr"), email, name, role: "student" as const, title: `Student · Section ${section}`, recruitOptIn: optIn };
      tx.insert(s.users).values({ ...row, universityId: uni.id, passwordHash: hash }).run();
      return { ...row, section, overrides, index: i };
    });

    /* ── Course ── */
    const course = { id: id("crs"), code: "DB 201", title: "Database Systems", term: "Fall 2026", instructorId: staff.instructor.id, universityId: uni.id };
    tx.insert(s.courses).values(course).run();
    tx.insert(s.enrollments).values({ id: id("enr"), courseId: course.id, userId: staff.instructor.id, role: "instructor", section: "A" }).run();
    tx.insert(s.enrollments).values({ id: id("enr"), courseId: course.id, userId: staff.ta.id, role: "ta", section: "A" }).run();
    for (const st of students) {
      tx.insert(s.enrollments).values({ id: id("enr"), courseId: course.id, userId: st.id, role: "student", section: st.section }).run();
    }

    const conceptIds = {} as Record<ConceptKey, string>;
    for (const c of conceptDefs) conceptIds[c.key] = id("cpt");
    for (const c of conceptDefs) {
      tx.insert(s.concepts)
        .values({
          id: conceptIds[c.key],
          courseId: course.id,
          name: c.name,
          description: c.description,
          unit: c.unit,
          prerequisiteId: "prereq" in c && c.prereq ? conceptIds[c.prereq as ConceptKey] : null,
          activityCache: c.key === "pk" ? { experiment: pkExperiment } : null,
        })
        .run();
    }

    /* ── Lectures & slides ── */
    const slideIds = new Map<string, string>(); // "lecture:page" -> slide id
    const slideText = new Map<string, { title: string; body: string }>();
    for (const l of lectureDefs) {
      const lectureId = id("lec");
      tx.insert(s.lectures)
        .values({ id: lectureId, courseId: course.id, number: l.number, title: l.title, fileName: `Lecture ${l.number} - ${l.title}.pdf`, status: "ready", progress: 100 })
        .run();
      l.slides.forEach((sl, i) => {
        const slideId = id("sld");
        slideIds.set(`${l.number}:${i + 1}`, slideId);
        slideText.set(`${l.number}:${i + 1}`, { title: sl.title, body: sl.body });
        tx.insert(s.slides).values({ id: slideId, lectureId, page: i + 1, title: sl.title, body: sl.body }).run();
        for (const ck of sl.concepts ?? []) {
          tx.insert(s.slideConcepts).values({ slideId, conceptId: conceptIds[ck], status: sl.suggested ? "suggested" : "confirmed" }).run();
        }
      });
    }

    /* ── Midterm exam ── */
    const exam = { id: id("exm"), courseId: course.id, title: "Midterm exam", kind: "midterm" as const, date: "2026-11-10", status: "review" as const };
    tx.insert(s.exams).values(exam).run();

    const qIds = new Map<number, string>();
    const critIds = new Map<string, string>(); // "q:code"
    for (const q of questionDefs) {
      const qid = id("qst");
      qIds.set(q.number, qid);
      tx.insert(s.questions)
        .values({ id: qid, examId: exam.id, number: q.number, prompt: q.prompt, maxMarks: q.maxMarks, modelAnswer: q.modelAnswer, conceptId: conceptIds[q.concept] })
        .run();
      for (const c of q.criteria) {
        const cid = id("crt");
        critIds.set(`${q.number}:${c.code}`, cid);
        tx.insert(s.criteria)
          .values({
            id: cid,
            questionId: qid,
            code: c.code,
            description: c.description,
            marks: c.marks,
            conceptId: conceptIds[q.concept],
            slideId: c.slide ? slideIds.get(`${c.slide[0]}:${c.slide[1]}`) ?? null : null,
            aiDrafted: q.number === 3,
          })
          .run();
      }
    }

    /* ── Papers, answers, criterion results ── */
    const released = (st: (typeof students)[number]) => st.section === "B" || (st.index >= 1 && st.index <= 6);
    const variantCounts = new Map<string, { count: number; examples: Set<string> }>();

    for (const st of students) {
      const isReleased = released(st);
      const paperId = id("ppr");
      tx.insert(s.papers)
        .values({ id: paperId, examId: exam.id, studentId: st.id, section: st.section, fileName: `scan-${st.name.replace(/\s/g, "-").toLowerCase()}.pdf`, status: isReleased ? "released" : "analysed" })
        .run();

      for (const q of questionDefs) {
        const defaultKey = q.variants[(st.index + q.number) % 3 === 0 && q.variants.length > 1 ? 1 : 0]!.key;
        const vKey = st.overrides[q.number] ?? defaultKey;
        const v = q.variants.find((x) => x.key === vKey) ?? q.variants[0]!;
        const suggested = v.results.reduce((a, r) => a + r.marks, 0);
        const answerId = id("ans");
        tx.insert(s.answers)
          .values({
            id: answerId,
            paperId,
            questionId: qIds.get(q.number)!,
            handwriting: wrapHandwriting(`Q${q.number}) ${v.text}`),
            transcription: v.text,
            confidence: v.confidence ?? 0.95,
            lowConfidence: v.lowConfidence ?? [],
            status: isReleased ? "released" : "analysed",
            // The demo papers carry Dr. Karim's red-pen marks; one is smudged so the review shows a flag.
            paperMarks: suggested,
            paperMarkConfidence: st.name === "Laila Fathy" && q.number === 3 ? 0.55 : 0.97,
            suggestedMarks: suggested,
            finalMarks: isReleased ? suggested : null,
            errorType: v.errorType ?? null,
            followupQuestion: v.followup?.question ?? null,
            followupReason: v.followup?.reason ?? null,
            followupChoices: v.followup ? followupChoicesFor(q.prompt) : null,
            followupEnabled: true,
            model: "seed",
            reviewedBy: isReleased ? staff.instructor.id : null,
            reviewedAt: isReleased ? new Date("2026-11-12T10:00:00Z") : null,
          })
          .run();
        q.criteria.forEach((c, ci) => {
          const r = v.results[ci]!;
          // Same rule as the live pipeline: explanations come from the criterion's own slide and cite it.
          const key = c.slide ? `${c.slide[0]}:${c.slide[1]}` : null;
          const slide = key ? slideText.get(key) : undefined;
          const explained = r.status !== "met" && key && slide;
          tx.insert(s.criterionResults)
            .values({
              id: id("res"),
              answerId,
              criterionId: critIds.get(`${q.number}:${c.code}`)!,
              status: r.status,
              evidence: r.evidence,
              gap: r.gap,
              marks: r.marks,
              aiConfidence: r.status === "partial" ? 0.84 : 0.93,
              explanation: explained ? explainFromSlide(slide.title, slide.body) : "",
              citedSlideId: explained ? slideIds.get(key)! : null,
            })
            .run();
        });

        if (isReleased) {
          tx.insert(s.attempts)
            .values({ id: id("att"), studentId: st.id, conceptId: conceptIds[q.concept], label: `Midterm · Q${q.number}`, date: exam.date, score: suggested, maxScore: q.maxMarks, source: "exam" })
            .run();
        }

        const k = `${q.number}:${v.key}`;
        const entry = variantCounts.get(k) ?? { count: 0, examples: new Set<string>() };
        entry.count++;
        const ex = v.results.find((r) => r.status !== "met" && r.evidence)?.evidence;
        if (ex) entry.examples.add(ex);
        variantCounts.set(k, entry);
      }

      // Earlier quiz history (used by early-support alerts)
      const quizFk = st.index === 1 ? 1 : 2 + (st.index % 2);
      tx.insert(s.attempts).values({ id: id("att"), studentId: st.id, conceptId: conceptIds.fk, label: "Quiz 2 · Q2", date: "2026-10-12", score: quizFk, maxScore: 3, source: "quiz" }).run();
      tx.insert(s.attempts).values({ id: id("att"), studentId: st.id, conceptId: conceptIds.pk, label: "Quiz 2 · Q1", date: "2026-10-12", score: 1 + (st.index % 3), maxScore: 3, source: "quiz" }).run();
    }

    /* ── Youssef's practice attempt + the early alert ── */
    const youssef = students[1]!;
    tx.insert(s.attempts).values({ id: id("att"), studentId: youssef.id, conceptId: conceptIds.fk, label: "Practice set", date: "2026-11-20", score: 1, maxScore: 3, source: "practice" }).run();
    tx.insert(s.alerts)
      .values({
        id: id("alr"),
        courseId: course.id,
        studentId: youssef.id,
        conceptId: conceptIds.fk,
        dependentConcept: "SQL joins",
        summary: `${youssef.name} is passing the course but has missed Foreign keys in three assessments. Unit 3, SQL joins, builds on it.`,
        suggestion: "A 10-minute check-in after Lecture 5, or assign the foreign-keys practice set before joins start.",
      })
      .run();

    /* ── Misconceptions & question flag ── */
    const group = (qn: number, keys: string[], title: string) => {
      let count = 0;
      const examples = new Set<string>();
      for (const k of keys) {
        const e = variantCounts.get(`${qn}:${k}`);
        if (!e) continue;
        count += e.count;
        e.examples.forEach((x) => examples.add(x));
      }
      if (count) tx.insert(s.misconceptions).values({ id: id("mis"), questionId: qIds.get(qn)!, title, studentCount: count, examples: Array.from(examples).slice(0, 3) }).run();
    };
    group(3, ["describe-mariam", "describe"], "Describes the column instead of the rule");
    group(3, ["name"], "Believes a name can identify a student");
    group(4, ["table-reading"], "Treats the relationship as a table, not a link");
    group(4, ["fk-only"], "Names foreign keys but not what they reference");
    group(5, ["names"], "Joins on names instead of keys");

    const tableReading = variantCounts.get("4:table-reading")?.count ?? 0;
    tx.insert(s.questionFlags)
      .values({
        id: id("flg"),
        questionId: qIds.get(4)!,
        answerCount: tableReading,
        reason: `${tableReading} answers read “relationship” as a table, not a link between tables. Their reasoning is consistent with that reading.`,
        decision: null,
      })
      .run();

    /* ── An MCQ quiz: scored by rules on the key, with Socratic-style chains for the wrong options students chose ── */
    const l4 = (title: string) => {
      const page = lectureDefs.find((l) => l.number === 4)!.slides.findIndex((sl) => sl.title === title) + 1;
      return { id: slideIds.get(`4:${page}`)!, ...slideText.get(`4:${page}`)! };
    };
    const quiz2 = { id: id("exm"), courseId: course.id, title: "Quiz 2 · Keys (MCQ)", kind: "quiz" as const, date: "2026-10-28", status: "released" as const };
    tx.insert(s.exams).values(quiz2).run();
    const mcqDefs = [
      {
        prompt: "Which column is the best primary key for Student(StudentID, Name, Email, Phone)?",
        options: ["Name", "StudentID", "Phone", "Name + Phone"],
        correct: "B",
        concept: "pk" as ConceptKey,
        pick: (i: number) => (i % 5 === 0 ? "A" : i % 7 === 3 ? "D" : "B"),
      },
      {
        prompt: "Enrollment(StudentID, CourseCode, Term): what does Enrollment.StudentID refer to?",
        options: ["Nothing, it is just a number", "The primary key of Student", "The primary key of Course", "A new row in Student"],
        correct: "B",
        concept: "fk" as ConceptKey,
        pick: (i: number) => (i % 4 === 1 ? "C" : i % 9 === 2 ? "A" : "B"),
      },
      {
        prompt: "Can a primary key value be NULL?",
        options: ["Yes, while the row is new", "Yes, but only once per table", "No, never", "Only for surrogate keys"],
        correct: "C",
        concept: "pk" as ConceptKey,
        pick: (i: number) => (i % 3 === 2 ? "B" : i % 10 === 4 ? "A" : "C"),
      },
    ];
    const mcqIds = mcqDefs.map((q, qi) => {
      const qid = id("qst");
      tx.insert(s.questions)
        .values({ id: qid, examId: quiz2.id, number: qi + 1, prompt: q.prompt, maxMarks: 1, kind: "mcq", options: q.options, correctOption: q.correct, conceptId: conceptIds[q.concept] })
        .run();
      return qid;
    });
    const mcqAnswerIds = new Map<string, string>(); // "student:q" -> answer id
    for (const st of students) {
      const paperId = id("ppr");
      tx.insert(s.papers).values({ id: paperId, examId: quiz2.id, studentId: st.id, section: st.section, fileName: "quiz2-choices.csv", status: "released" }).run();
      mcqDefs.forEach((q, qi) => {
        const chosen = q.pick(st.index);
        const marks = chosen === q.correct ? 1 : 0;
        const answerId = id("ans");
        mcqAnswerIds.set(`${st.index}:${qi}`, answerId);
        tx.insert(s.answers)
          .values({
            id: answerId,
            paperId,
            questionId: mcqIds[qi]!,
            transcription: `${chosen}) ${q.options["ABCD".indexOf(chosen)]}`,
            chosenOption: chosen,
            status: "released",
            paperMarks: marks,
            suggestedMarks: marks,
            finalMarks: marks,
            model: "csv-import",
            reviewedBy: staff.instructor.id,
            reviewedAt: new Date("2026-10-29T10:00:00Z"),
          })
          .run();
      });
    }
    // A small question bank: fresh multiple-choice questions for after a 2-tap fix.
    const bank = { id: id("exm"), courseId: course.id, title: "Question bank · Keys", kind: "practice" as const, date: "2026-10-01", status: "setup" as const };
    tx.insert(s.exams).values(bank).run();
    [
      { prompt: "Course(CourseCode, Title, Credits, Instructor): which column should be the primary key?", options: ["Title", "Instructor", "CourseCode", "Credits"], correct: "C", concept: "pk" as ConceptKey },
      { prompt: "Grade(StudentID, CourseCode, Mark): which columns are foreign keys?", options: ["Mark only", "StudentID and CourseCode", "None of them", "All three"], correct: "B", concept: "fk" as ConceptKey },
    ].forEach((q, qi) => {
      tx.insert(s.questions)
        .values({ id: id("qst"), examId: bank.id, number: qi + 1, prompt: q.prompt, maxMarks: 1, kind: "mcq", options: q.options, correctOption: q.correct, conceptId: conceptIds[q.concept] })
        .run();
    });
    // Chains as the AI writes them from the question, the options and the slides (no student data).
    const rules = l4("Rules for primary keys");
    const fkSlide = l4("Foreign keys");
    const integrity = l4("Referential integrity");
    const chainDefs = [
      {
        q: 0,
        option: "A",
        status: "approved" as const,
        slide: rules,
        misconception: "Believes a name can identify a student.",
        steps: [
          {
            prompt: "Two students in your year are both called Mariam Adel. With Name as the key, which row does an update change?",
            choices: [
              { text: "The one added first", correct: false },
              { text: "The database can't tell them apart", correct: true },
              { text: "Both, and that's fine", correct: false },
            ],
            hint: "A primary key must be unique: two rows can never share it.",
          },
          {
            prompt: "So what must a primary key guarantee?",
            choices: [
              { text: "It is easy to read", correct: false },
              { text: "It is the first column", correct: false },
              { text: "No two rows share its value", correct: true },
            ],
            hint: rules.body,
          },
        ],
        explanation: rules.body,
      },
      {
        q: 1,
        option: "C",
        status: "approved" as const,
        slide: fkSlide,
        misconception: "Mixes up which table a foreign key points to.",
        steps: [
          {
            prompt: "Enrollment.StudentID holds values like 1042. In which table is 1042 a primary key value?",
            choices: [
              { text: "Course", correct: false },
              { text: "Student", correct: true },
              { text: "Enrollment", correct: false },
            ],
            hint: fkSlide.body,
          },
          {
            prompt: "An Enrollment row has StudentID 9999, and no such student exists. What does the DBMS do?",
            choices: [
              { text: "Refuses the row", correct: true },
              { text: "Accepts it", correct: false },
              { text: "Creates the student", correct: false },
            ],
            hint: integrity.body,
          },
        ],
        explanation: fkSlide.body,
      },
      {
        q: 2,
        option: "B",
        status: "draft" as const,
        slide: rules,
        misconception: "Thinks a single empty key value is harmless.",
        steps: [
          {
            prompt: "If one row's StudentID is NULL, can you point to exactly that row by its key?",
            choices: [
              { text: "Yes", correct: false },
              { text: "No, there is no value to match", correct: true },
            ],
            hint: rules.body,
          },
          {
            prompt: "So how many NULL primary key values may a table have?",
            choices: [
              { text: "One", correct: false },
              { text: "None", correct: true },
              { text: "As many as needed", correct: false },
            ],
            hint: rules.body,
          },
        ],
        explanation: rules.body,
      },
    ];
    for (const c of chainDefs) {
      const chainId = id("chn");
      tx.insert(s.chains)
        .values({ id: chainId, questionId: mcqIds[c.q]!, option: c.option, misconception: c.misconception, steps: c.steps, explanation: c.explanation, citedSlideId: c.slide.id, status: c.status, model: "seed" })
        .run();
      if (c.status !== "approved") continue;
      // A few classmates already tapped through (Mariam has not, so the demo starts fresh).
      students
        .filter((st) => st.index > 0 && mcqDefs[c.q]!.pick(st.index) === c.option)
        .slice(0, 4)
        .forEach((st, k) => {
          const selfFound = k % 2 === 0;
          tx.insert(s.chainRuns)
            .values({
              id: id("run"),
              chainId,
              studentId: st.id,
              answerId: mcqAnswerIds.get(`${st.index}:${c.q}`)!,
              taps: c.steps.map((stp, si) => ({ step: si, choice: stp.choices.findIndex((x) => x.correct), correct: true })),
              selfFound,
            })
            .run();
        });
    }

    /* ── A second course, so students with several courses pick the subject in "My papers" ── */
    const mona = { id: id("usr"), email: "dr.mona@gapmap.demo", name: "Dr. Mona Saad", role: "instructor" as const, title: "Lecturer, Faculty of Computing" };
    tx.insert(s.users).values({ ...mona, universityId: uni.id, passwordHash: hash }).run();
    const se = { id: id("crs"), code: "SE 220", title: "Software Engineering", term: "Fall 2026", instructorId: mona.id, universityId: uni.id };
    tx.insert(s.courses).values(se).run();
    tx.insert(s.enrollments).values({ id: id("enr"), courseId: se.id, userId: mona.id, role: "instructor", section: "A" }).run();
    const reqConcept = id("cpt");
    tx.insert(s.concepts).values({ id: reqConcept, courseId: se.id, name: "Requirements", description: "Functional and non-functional requirements", unit: 1 }).run();
    const seLecture = id("lec");
    tx.insert(s.lectures).values({ id: seLecture, courseId: se.id, number: 1, title: "Requirements engineering", fileName: "Lecture 1 - Requirements engineering.pdf", status: "ready", progress: 100 }).run();
    const seSlides = [
      { title: "Functional requirements", body: "A functional requirement says what the system must do, for example: a student can register for a course." },
      { title: "Non-functional requirements", body: "A non-functional requirement says how well the system must work: speed, security, usability. It must be measurable, for example: pages load in under 2 seconds." },
    ].map((sl, i) => {
      const slideId = id("sld");
      tx.insert(s.slides).values({ id: slideId, lectureId: seLecture, page: i + 1, title: sl.title, body: sl.body }).run();
      tx.insert(s.slideConcepts).values({ slideId, conceptId: reqConcept, status: "confirmed" }).run();
      return { id: slideId, ...sl };
    });
    const seExam = { id: id("exm"), courseId: se.id, title: "Quiz 1", kind: "quiz" as const, date: "2026-10-20", status: "released" as const };
    tx.insert(s.exams).values(seExam).run();
    const seQuestions = [
      {
        prompt: "Give one functional and one non-functional requirement for a course registration system.",
        criteria: [
          { description: "Gives a functional requirement (what the system does)", slide: 0 },
          { description: "Gives a measurable non-functional requirement (how well it works)", slide: 1 },
        ],
        full: { text: "Functional: a student can register for a course. Non-functional: the page loads in under 2 seconds.", evidence: ["a student can register for a course", "the page loads in under 2 seconds"] },
        partial: { text: "A student can register for a course and see the timetable.", evidence: ["A student can register for a course", ""], gap: ["", "No non-functional requirement: how well the system must work."] },
      },
      {
        prompt: "Is “The system must be fast” a good requirement? Explain.",
        criteria: [
          { description: "Identifies it as non-functional", slide: 1 },
          { description: "Explains it must be measurable (e.g. under 2 seconds)", slide: 1 },
        ],
        full: { text: "It is non-functional but too vague. It should be measurable, like pages load in under 2 seconds.", evidence: ["It is non-functional", "It should be measurable"] },
        partial: { text: "Yes, because speed is important for students.", evidence: ["", ""], gap: ["Does not say it is a non-functional requirement.", "Does not say it must be measurable."] },
      },
    ];
    const seQ = seQuestions.map((q, i) => {
      const qid = id("qst");
      tx.insert(s.questions).values({ id: qid, examId: seExam.id, number: i + 1, prompt: q.prompt, maxMarks: 2, modelAnswer: "", conceptId: reqConcept }).run();
      const crits = q.criteria.map((c, ci) => {
        const cid = id("crt");
        tx.insert(s.criteria).values({ id: cid, questionId: qid, code: `C${ci + 1}`, description: c.description, marks: 1, conceptId: reqConcept, slideId: seSlides[c.slide]!.id }).run();
        return { id: cid, slide: seSlides[c.slide]! };
      });
      return { id: qid, def: q, crits };
    });
    for (const st of students.slice(0, 8)) {
      tx.insert(s.enrollments).values({ id: id("enr"), courseId: se.id, userId: st.id, role: "student", section: "A" }).run();
      // Mariam's quiz stays unreleased so the main demo story is unchanged.
      if (st.index < 1 || st.index > 6) continue;
      const paperId = id("ppr");
      tx.insert(s.papers).values({ id: paperId, examId: seExam.id, studentId: st.id, section: "A", fileName: `se-quiz1-${st.name.replace(/\s/g, "-").toLowerCase()}.pdf`, status: "released" }).run();
      seQ.forEach((q, qi) => {
        const full = (st.index + qi) % 2 === 0;
        const v = full ? q.def.full : q.def.partial;
        const statuses = full ? ["met", "met"] : v.evidence.map((e) => (e ? "met" : "missing"));
        const marks = statuses.filter((x) => x === "met").length;
        const answerId = id("ans");
        tx.insert(s.answers)
          .values({
            id: answerId,
            paperId,
            questionId: q.id,
            handwriting: wrapHandwriting(`Q${qi + 1}) ${v.text}`),
            transcription: v.text,
            confidence: 0.95,
            paperMarks: marks,
            paperMarkConfidence: 0.97,
            status: "released",
            suggestedMarks: marks,
            finalMarks: marks,
            model: "seed",
            reviewedBy: mona.id,
            reviewedAt: new Date("2026-10-22T10:00:00Z"),
          })
          .run();
        q.crits.forEach((c, ci) => {
          const status = statuses[ci] as "met" | "missing";
          tx.insert(s.criterionResults)
            .values({
              id: id("res"),
              answerId,
              criterionId: c.id,
              status,
              evidence: v.evidence[ci] ?? "",
              gap: status === "met" ? "" : ((v as { gap?: string[] }).gap?.[ci] ?? ""),
              marks: status === "met" ? 1 : 0,
              aiConfidence: 0.92,
              explanation: status === "met" ? "" : explainFromSlide(c.slide.title, c.slide.body),
              citedSlideId: status === "met" ? null : c.slide.id,
            })
            .run();
        });
      });
    }

    /* ── Anonymous discussions ── */
    const omar = students[4]!;
    const salma = students[5]!;
    const t1 = id("thr");
    tx.insert(s.threads).values({ id: t1, courseId: course.id, studentId: omar.id, alias: "Student 7K", subject: "Why is “every student has an ID” only partial on Q3?", status: "answered" }).run();
    tx.insert(s.threadMessages).values({ id: id("msg"), threadId: t1, authorRole: "student", body: "I said StudentID because every student has an ID. Why is that only partial?" }).run();
    tx.insert(s.threadMessages)
      .values({ id: id("msg"), threadId: t1, authorRole: "instructor", body: "Every student having an ID is true, but the reason it can be a key is that no two students share the same one. Add that and it's full marks." })
      .run();
    const t2 = id("thr");
    tx.insert(s.threads).values({ id: t2, courseId: course.id, studentId: salma.id, alias: "Student 2Q", subject: "Is Q4 asking for the table or the columns?", status: "open" }).run();
    tx.insert(s.threadMessages)
      .values({ id: id("msg"), threadId: t2, authorRole: "student", body: "I described the Enrollment table as the relationship. Was the question asking which columns are foreign keys instead?" })
      .run();

    /* ── Internship ── */
    const vacancyId = id("vac");
    tx.insert(s.vacancies)
      .values({
        id: vacancyId,
        companyId: company.id,
        title: "Data analyst intern",
        description: "Summer internship working with SQL reporting on enrolment and sales data.",
        skills: ["SQL joins", "Primary & foreign keys", "Data cleaning"],
        conceptIds: [conceptIds.joins, conceptIds.fk, conceptIds.pk],
        closes: "2027-01-15",
      })
      .run();
    tx.insert(s.nominations)
      .values({ id: id("nom"), vacancyId, studentId: students[3]!.id, nominatedBy: staff.instructor.id, note: "Full marks on keys and joins.", status: "interview" })
      .run();

    tx.insert(s.auditLog).values({ id: id("aud"), actorId: null, action: "seed", object: "database" }).run();
  });

  handle.close();
  return { file, password: DEMO_PASSWORD };
}

if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  loadSqlJs().then((SQL) => {
    const r = seed(SQL);
    console.log(`✔ Seeded ${r.file}\n  Demo password for every account: ${r.password}\n  See CREDENTIALS.md for the accounts.`);
    console.log('  Stop the dev server before seeding from the terminal, or use "Reset demo data" on the login page.');
  });
}
