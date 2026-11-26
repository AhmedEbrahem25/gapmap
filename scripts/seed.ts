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
import {
  DEMO_PASSWORD,
  conceptDefs,
  lectureDefs,
  questionDefs,
  studentDefs,
  wrapHandwriting,
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
      instructor: { id: id("usr"), email: "dr.salma@gapmap.demo", name: "Dr. Salma Nour", role: "instructor" as const, title: "Lecturer, Faculty of Computing" },
      ta: { id: id("usr"), email: "ta.karim@gapmap.demo", name: "Karim Lotfy", role: "ta" as const, title: "Teaching assistant" },
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
        })
        .run();
    }

    /* ── Lectures & slides ── */
    const slideIds = new Map<string, string>(); // "lecture:page" -> slide id
    for (const l of lectureDefs) {
      const lectureId = id("lec");
      tx.insert(s.lectures)
        .values({ id: lectureId, courseId: course.id, number: l.number, title: l.title, fileName: `Lecture ${l.number} - ${l.title}.pdf`, status: "ready", progress: 100 })
        .run();
      l.slides.forEach((sl, i) => {
        const slideId = id("sld");
        slideIds.set(`${l.number}:${i + 1}`, slideId);
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
            suggestedMarks: suggested,
            finalMarks: isReleased ? suggested : null,
            errorType: v.errorType ?? null,
            followupQuestion: v.followup?.question ?? null,
            followupReason: v.followup?.reason ?? null,
            followupEnabled: true,
            model: "seed",
            reviewedBy: isReleased ? staff.instructor.id : null,
            reviewedAt: isReleased ? new Date("2026-11-12T10:00:00Z") : null,
          })
          .run();
        q.criteria.forEach((c, ci) => {
          const r = v.results[ci]!;
          tx.insert(s.criterionResults)
            .values({ id: id("res"), answerId, criterionId: critIds.get(`${q.number}:${c.code}`)!, status: r.status, evidence: r.evidence, gap: r.gap, marks: r.marks, aiConfidence: r.status === "partial" ? 0.84 : 0.93 })
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
