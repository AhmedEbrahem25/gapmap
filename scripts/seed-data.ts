/** Demo content for the Database Systems course used in the hackathon demo. */

export const DEMO_PASSWORD = "GapMap@2026";

export const conceptDefs = [
  { key: "entities", name: "Entities & attributes", unit: 1, description: "Things a database stores and the facts recorded about them." },
  { key: "relationships", name: "ER relationships", unit: 1, description: "How entities relate, including cardinality (1:1, 1:N, M:N)." },
  { key: "pk", name: "Primary keys", unit: 2, description: "A column (or set) whose value is unique and stable for every row." },
  { key: "fk", name: "Foreign keys", unit: 2, description: "A column that references another table's primary key.", prereq: "pk" },
  { key: "joins", name: "SQL joins", unit: 3, description: "Combining rows from related tables through key columns.", prereq: "fk" },
  { key: "normalisation", name: "Normalisation", unit: 3, description: "Organising tables to remove redundancy and update anomalies.", prereq: "pk" },
] as const;

export type ConceptKey = (typeof conceptDefs)[number]["key"];

type SlideDef = { title: string; body: string; concepts?: ConceptKey[]; suggested?: boolean };

export const lectureDefs: { number: number; title: string; slides: SlideDef[] }[] = [
  {
    number: 1,
    title: "Introduction to databases",
    slides: [
      { title: "Why databases?", body: "Files duplicate data and drift apart. A database keeps one shared, consistent copy that many programs can use safely." },
      { title: "The DBMS", body: "A database management system stores data, enforces rules, controls access and recovers from failures." },
      { title: "Entities", body: "An entity is a thing we store facts about: a Student, a Course, a Book. Each entity becomes a table.", concepts: ["entities"] },
      { title: "Attributes", body: "Attributes are the facts we record about an entity: a Student has a name, an email and a date of birth.", concepts: ["entities"] },
      { title: "Example: a library", body: "Entities: Book (title, ISBN, year), Member (name, phone), Loan (date out, date due)." , concepts: ["entities"]},
      { title: "Summary", body: "Entities are tables, attributes are columns, and each row describes one real-world thing." },
    ],
  },
  {
    number: 2,
    title: "The relational model",
    slides: [
      { title: "Relations are tables", body: "A relation is a set of rows with the same columns. Order of rows does not matter." },
      { title: "Domains", body: "Each attribute takes values from a domain: integers, dates, text of a fixed length." },
      { title: "Rows must be distinguishable", body: "Because a relation is a set, no two rows may be identical. We need a way to tell them apart.", concepts: ["pk"] },
      { title: "NULL", body: "NULL means unknown or not applicable. It is not zero and not an empty string." },
      { title: "Integrity constraints", body: "Constraints are rules the DBMS enforces: data types, NOT NULL, uniqueness, and references between tables." },
    ],
  },
  {
    number: 3,
    title: "ER modelling",
    slides: [
      { title: "ER diagrams", body: "Rectangles are entities, ovals are attributes, diamonds are relationships.", concepts: ["entities", "relationships"] },
      { title: "Relationships", body: "A relationship connects entities: a Student enrols in a Course.", concepts: ["relationships"] },
      { title: "Cardinality", body: "1:1, 1:N or M:N. A student takes many courses; a course has many students, so Enrols is M:N.", concepts: ["relationships"] },
      { title: "Resolving M:N", body: "An M:N relationship becomes its own table (Enrollment) holding the keys of both sides.", concepts: ["relationships", "fk"] },
      { title: "Participation", body: "Total participation: every course must have an instructor. Partial: a student may have no club." , concepts: ["relationships"]},
      { title: "From ER to tables", body: "Each entity → table; each attribute → column; each M:N relationship → a linking table." },
    ],
  },
  {
    number: 4,
    title: "Keys and unique identification",
    slides: [
      { title: "Lecture 4 overview", body: "Superkeys, candidate keys, primary keys, composite keys and foreign keys." },
      { title: "Recap: rows must differ", body: "Lecture 2: a relation is a set, so rows must be distinguishable." },
      { title: "Superkeys", body: "A superkey is any set of columns whose values never repeat across rows." },
      { title: "Minimal superkeys", body: "Remove any column you don't need. What is left is minimal." },
      { title: "Example: Student", body: "{StudentID}, {Email}, {StudentID, Name} are superkeys. {Name} is not: two students can share a name." },
      { title: "Why not Name?", body: "Names repeat. Two 'Mariam Adel's in one year is normal at a large faculty.", concepts: ["pk"] },
      { title: "Natural vs surrogate", body: "A natural key comes from the real world (national ID). A surrogate key is generated (an auto-number)." },
      { title: "Practice", body: "Find the superkeys of Course(CourseCode, Title, Credits, Instructor)." },
      { title: "Candidate keys", body: "A candidate key is a minimal superkey. A table can have several: StudentID and Email.", concepts: ["pk"] },
      { title: "Choosing among candidates", body: "Prefer short, stable values that the institution controls.", concepts: ["pk"] },
      { title: "Primary keys", body: "The primary key is the candidate key we choose to identify rows. PRIMARY KEY (StudentID).", concepts: ["pk"] },
      {
        title: "Unique identification",
        body: "Every row needs a value that no other row shares, so the database can point to exactly one student. If two rows share a key, an UPDATE or DELETE hits both.",
        concepts: ["pk"],
        suggested: true,
      },
      { title: "Rules for primary keys", body: "A primary key must be unique, must never be NULL, and should not change over time.", concepts: ["pk"] },
      { title: "Composite keys", body: "Sometimes one column is not enough: Enrollment(StudentID, CourseCode, Term).", concepts: ["pk"] },
      { title: "Foreign keys", body: "A foreign key is a column that references another table's primary key: Enrollment.StudentID → Student.StudentID.", concepts: ["fk"] },
      { title: "Referential integrity", body: "The DBMS refuses an Enrollment row whose StudentID does not exist in Student.", concepts: ["fk"] },
    ],
  },
  {
    number: 5,
    title: "SQL joins",
    slides: [
      { title: "Why join?", body: "Data about one thing is spread across tables. A join puts it back together using keys.", concepts: ["joins"] },
      { title: "INNER JOIN", body: "SELECT s.Name, c.Title FROM Student s JOIN Enrollment e ON e.StudentID = s.StudentID JOIN Course c ON c.CourseCode = e.CourseCode;", concepts: ["joins", "fk"] },
      { title: "Join conditions", body: "Match the foreign key to the primary key it references. A missing condition creates a cross product.", concepts: ["joins"] },
      { title: "LEFT JOIN", body: "Keeps every row from the left table even when there is no match on the right.", concepts: ["joins"] },
      { title: "Common mistakes", body: "Joining on names instead of keys; forgetting a table in the chain; ambiguous column names.", concepts: ["joins"] },
    ],
  },
];

export type CritDef = { code: string; description: string; marks: number; slide?: [number, number] };
export type Variant = {
  key: string;
  text: string;
  results: { status: "met" | "partial" | "missing"; evidence: string; gap: string; marks: number }[];
  errorType?: string;
  followup?: { question: string; reason: string };
  lowConfidence?: string[];
  confidence?: number;
};

export const questionDefs: {
  number: number;
  concept: ConceptKey;
  prompt: string;
  maxMarks: number;
  modelAnswer: string;
  criteria: CritDef[];
  variants: Variant[];
}[] = [
  {
    number: 1,
    concept: "entities",
    prompt: "A library lends books to members. Identify two entities and give two attributes for each.",
    maxMarks: 2,
    modelAnswer: "Book (ISBN, title) and Member (member number, name).",
    criteria: [
      { code: "C1", description: "Identifies two suitable entities", marks: 1, slide: [1, 3] },
      { code: "C2", description: "Gives two correct attributes for each entity", marks: 1, slide: [1, 4] },
    ],
    variants: [
      {
        key: "full",
        text: "Book with ISBN and title. Member with name and phone number.",
        results: [
          { status: "met", evidence: "Book with ISBN and title", gap: "", marks: 1 },
          { status: "met", evidence: "Member with name and phone number", gap: "", marks: 1 },
        ],
      },
      {
        key: "partial",
        text: "Book and Member. Book has a title.",
        results: [
          { status: "met", evidence: "Book and Member", gap: "", marks: 1 },
          { status: "partial", evidence: "Book has a title", gap: "Give two attributes for each entity; Member has none listed.", marks: 0.5 },
        ],
        errorType: "Missing step",
      },
    ],
  },
  {
    number: 2,
    concept: "relationships",
    prompt: "Describe the relationship between Student and Course and state its cardinality.",
    maxMarks: 3,
    modelAnswer: "Students enrol in courses. It is many-to-many: a student takes many courses and a course has many students.",
    criteria: [
      { code: "C1", description: "States the relationship is many-to-many", marks: 2, slide: [3, 3] },
      { code: "C2", description: "Justifies it from both sides", marks: 1, slide: [3, 3] },
    ],
    variants: [
      {
        key: "full",
        text: "Student enrols in Course. It is many to many because a student takes many courses and each course has many students.",
        results: [
          { status: "met", evidence: "It is many to many", gap: "", marks: 2 },
          { status: "met", evidence: "a student takes many courses and each course has many students", gap: "", marks: 1 },
        ],
      },
      {
        key: "one-side",
        text: "Student takes Course, one to many because a student takes many courses.",
        results: [
          { status: "missing", evidence: "", gap: "The cardinality is many-to-many, not one-to-many.", marks: 0 },
          { status: "partial", evidence: "a student takes many courses", gap: "Also consider the course side: a course has many students.", marks: 0.5 },
        ],
        errorType: "Misconception",
      },
    ],
  },
  {
    number: 3,
    concept: "pk",
    prompt: "Choose a primary key for the Student table and justify your choice.",
    maxMarks: 4,
    modelAnswer: "StudentID, because every student needs a value that no other student shares and that never changes.",
    criteria: [
      { code: "C1", description: "Names a suitable primary key (StudentID)", marks: 1, slide: [4, 11] },
      { code: "C2", description: "Explains that each student needs a distinct value (uniqueness)", marks: 2, slide: [4, 12] },
      { code: "C3", description: "Notes the value should not change or be empty", marks: 1, slide: [4, 13] },
    ],
    variants: [
      {
        key: "describe-mariam",
        text: "I will choose StudentID as the primary key because it is the student number. Name can not be a key.",
        lowConfidence: ["can not"],
        confidence: 0.97,
        results: [
          { status: "met", evidence: "I will choose StudentID as the primary key", gap: "", marks: 1 },
          {
            status: "partial",
            evidence: "because it is the student number",
            gap: "Why each student must have a value no one else shares. “It is the student number” describes the column but not the rule.",
            marks: 1,
          },
          { status: "missing", evidence: "", gap: "The key should never be empty or change over time. Not mentioned in the answer.", marks: 0 },
        ],
        errorType: "Describes, doesn't justify",
        followup: {
          question: "What would happen if two students had the same name?",
          reason: "C2 has two likely readings: a short answer, or a real misunderstanding of uniqueness.",
        },
      },
      {
        key: "describe",
        text: "StudentID since every student has an ID.",
        results: [
          { status: "met", evidence: "StudentID", gap: "", marks: 1 },
          { status: "partial", evidence: "since every student has an ID", gap: "Having an ID is not the reason; explain that no two students can share it.", marks: 1 },
          { status: "missing", evidence: "", gap: "Say that the key must not be empty or change.", marks: 0 },
        ],
        errorType: "Describes, doesn't justify",
        followup: { question: "What would happen if two students had the same name?", reason: "C2 is ambiguous." },
      },
      {
        key: "unique",
        text: "StudentID, because it is unique for each student so we can find exactly one row.",
        results: [
          { status: "met", evidence: "StudentID", gap: "", marks: 1 },
          { status: "met", evidence: "it is unique for each student so we can find exactly one row", gap: "", marks: 2 },
          { status: "missing", evidence: "", gap: "Add that the key must never be empty or change.", marks: 0 },
        ],
        errorType: "Missing step",
      },
      {
        key: "full",
        text: "I choose StudentID because every student gets a different ID, so no two students can share it. It also never changes and can't be empty.",
        results: [
          { status: "met", evidence: "I choose StudentID", gap: "", marks: 1 },
          { status: "met", evidence: "every student gets a different ID, so no two students can share it", gap: "", marks: 2 },
          { status: "met", evidence: "It also never changes and can't be empty", gap: "", marks: 1 },
        ],
      },
      {
        key: "name",
        text: "Name and phone together are the key because they describe the student.",
        results: [
          { status: "missing", evidence: "", gap: "Name and phone are not a stable, unique identifier. StudentID is.", marks: 0 },
          { status: "missing", evidence: "", gap: "Names repeat between students, so they cannot identify one row.", marks: 0 },
          { status: "missing", evidence: "", gap: "Phone numbers change; a key must stay fixed.", marks: 0 },
        ],
        errorType: "Misconception",
      },
    ],
  },
  {
    number: 4,
    concept: "fk",
    prompt: "Explain how the Enrollment relationship links Student and Course. Which columns are foreign keys?",
    maxMarks: 4,
    modelAnswer: "Enrollment holds StudentID and CourseCode. Both are foreign keys referencing the primary keys of Student and Course.",
    criteria: [
      { code: "C1", description: "Identifies StudentID and CourseCode as foreign keys", marks: 2, slide: [4, 15] },
      { code: "C2", description: "States each references the primary key of Student / Course", marks: 2, slide: [4, 16] },
    ],
    variants: [
      {
        key: "full",
        text: "Enrollment has StudentID and CourseCode as foreign keys. StudentID references Student(StudentID) and CourseCode references Course(CourseCode), which links the two tables.",
        results: [
          { status: "met", evidence: "Enrollment has StudentID and CourseCode as foreign keys", gap: "", marks: 2 },
          { status: "met", evidence: "StudentID references Student(StudentID) and CourseCode references Course(CourseCode)", gap: "", marks: 2 },
        ],
      },
      {
        key: "table-reading",
        text: "The relationship is a new table called Enrollment that stores the student and course together.",
        results: [
          { status: "partial", evidence: "stores the student and course together", gap: "Name the foreign key columns: StudentID and CourseCode.", marks: 1 },
          { status: "missing", evidence: "", gap: "Say what each foreign key references.", marks: 0 },
        ],
        errorType: "Misconception",
      },
      {
        key: "fk-only",
        text: "StudentID in Enrollment is a foreign key and CourseCode too.",
        results: [
          { status: "met", evidence: "StudentID in Enrollment is a foreign key and CourseCode too", gap: "", marks: 2 },
          { status: "missing", evidence: "", gap: "Say that they reference the primary keys of Student and Course.", marks: 0 },
        ],
        errorType: "Missing step",
      },
    ],
  },
  {
    number: 5,
    concept: "joins",
    prompt: "Write a query that lists each student's name with the titles of the courses they are enrolled in.",
    maxMarks: 3,
    modelAnswer:
      "SELECT s.Name, c.Title FROM Student s JOIN Enrollment e ON e.StudentID = s.StudentID JOIN Course c ON c.CourseCode = e.CourseCode;",
    criteria: [
      { code: "C1", description: "Joins Student, Enrollment and Course", marks: 2, slide: [5, 2] },
      { code: "C2", description: "Uses the correct join conditions on the foreign keys", marks: 1, slide: [5, 3] },
    ],
    variants: [
      {
        key: "full",
        text: "SELECT Name, Title FROM Student JOIN Enrollment ON Enrollment.StudentID = Student.StudentID JOIN Course ON Course.CourseCode = Enrollment.CourseCode;",
        results: [
          { status: "met", evidence: "FROM Student JOIN Enrollment", gap: "", marks: 2 },
          { status: "met", evidence: "ON Enrollment.StudentID = Student.StudentID", gap: "", marks: 1 },
        ],
      },
      {
        key: "names",
        text: "SELECT Name, Title FROM Student, Course WHERE Student.Name = Course.Title;",
        results: [
          { status: "partial", evidence: "FROM Student, Course", gap: "Enrollment is missing from the join chain.", marks: 1 },
          { status: "missing", evidence: "", gap: "Join on the key columns, not on names.", marks: 0 },
        ],
        errorType: "Misconception",
      },
    ],
  },
];

/** Students: [name, section, recruitOptIn, variant overrides by question number]. */
export const studentDefs: [string, "A" | "B", boolean, Partial<Record<number, string>>][] = [
  ["Mariam Adel", "A", true, { 1: "full", 2: "full", 3: "describe-mariam", 4: "fk-only", 5: "full" }],
  ["Youssef Kamal", "A", true, { 3: "unique", 4: "fk-only", 5: "names" }],
  ["Nour Hassan", "A", true, { 1: "full", 2: "full", 3: "full", 4: "full", 5: "full" }],
  ["Ahmed Samir", "A", true, { 3: "full", 4: "full", 5: "full" }],
  ["Omar Khaled", "A", false, { 3: "describe" }],
  ["Salma Ibrahim", "A", false, { 3: "describe", 4: "table-reading" }],
  ["Hana Mostafa", "A", true, { 3: "unique" }],
  ["Hassan Tarek", "A", false, { 3: "name", 4: "table-reading" }],
  ["Laila Fathy", "A", false, { 3: "describe" }],
  ["Mohamed Ashraf", "A", false, { 3: "describe", 4: "table-reading" }],
  ["Farida Sherif", "A", true, { 3: "full" }],
  ["Ali Mahmoud", "A", false, { 3: "describe" }],
  ["Jana Wael", "A", false, { 3: "name" }],
  ["Ziad Hossam", "A", false, { 3: "describe", 4: "table-reading" }],
  ["Malak Amr", "A", false, { 3: "unique" }],
  ["Habiba Yasser", "B", false, { 3: "describe" }],
  ["Adham Reda", "B", false, { 3: "describe", 4: "table-reading" }],
  ["Rana Emad", "B", true, { 3: "full" }],
  ["Seif Magdy", "B", false, { 3: "name" }],
  ["Dina Sameh", "B", false, { 3: "describe" }],
  ["Mostafa Nabil", "B", false, { 3: "describe", 4: "table-reading" }],
  ["Yara Hesham", "B", false, { 3: "unique" }],
  ["Khaled Osama", "B", false, { 3: "describe" }],
  ["Menna Ayman", "B", false, { 3: "describe", 4: "table-reading" }],
  ["Hazem Fouad", "B", false, { 3: "name" }],
  ["Nada Gamal", "B", false, { 3: "describe" }],
  ["Tamer Saad", "B", false, { 3: "full", 4: "table-reading" }],
  ["Rawan Adel", "B", false, { 3: "describe" }],
  ["Amr Lotfy", "B", false, { 3: "describe", 4: "table-reading" }],
  ["Sara Medhat", "B", false, { 3: "unique" }],
];

export function wrapHandwriting(text: string, width = 32) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

/** The experiment cached for Primary keys, as the AI would draft it once from the slides. */
export const pkExperiment = {
  intro: "This table has no primary key. Two students got the same StudentID by mistake.",
  table: {
    columns: ["StudentID", "Name", "Email"],
    rows: [
      ["1042", "Mariam", "m@uni.edu"],
      ["1042", "Omar", "o@uni.edu"],
    ],
  },
  task: "Change only Omar's email.",
  sql: "UPDATE Student\nSET Email = 'omar@uni.edu'\nWHERE StudentID = 1042;",
  result: "2 rows updated — Mariam's email changed too",
  prompt: "In your own words: why did this happen?",
  checkFor: ["same", "both", "1042", "duplicate", "unique", "studentid"],
  answer: "The WHERE clause matched both rows because they share StudentID 1042, so the update hit both. A primary key prevents that by refusing duplicate values.",
};
