"""Demo dataset from plan Section 18: one course, 3 concepts, 9 MCQs (3 per concept), 20 students.

Slide numbers refer to lecture_pdf.PAGES (1-based).
"""

from app.models.enums import ErrorType

C = ErrorType.CONCEPTUAL
P = ErrorType.MISSING_PREREQUISITE
I = ErrorType.INCOMPLETE_ANSWER  # noqa: E741

COURSE = {"title": "Software Engineering", "code": "SE301", "term": "Fall 2026"}
EXAM = {"title": "Midterm Quiz 1", "exam_date": "2026-11-10"}

# key -> (name, description, approved slide pages)
CONCEPTS: dict[str, tuple[str, str, list[int]]] = {
    "agile": (
        "Agile",
        "Agile values, iterative and incremental delivery, and how Agile differs from Waterfall.",
        [2, 3, 4],
    ),
    "scrum": (
        "Scrum Roles",
        "The three Scrum accountabilities: Product Owner, Scrum Master and Developers.",
        [5, 6, 7, 8],
    ),
    "requirements": (
        "Requirements",
        "Functional vs. non-functional requirements, elicitation, user stories and acceptance criteria.",
        [9, 10, 11],
    ),
}


def opts(*items: tuple) -> list[dict]:
    """("A", "text") or ("A", "text", error_type) -> option dicts. Untagged wrong options -> unknown."""
    return [{"key": i[0], "text": i[1], "error_type": i[2] if len(i) > 2 else None} for i in items]


# (code, concept key, prompt, options, answer key)
QUESTIONS: list[tuple[str, str, str, list[dict], str]] = [
    (
        "Q1",
        "agile",
        "Which statement is one of the four Agile values?",
        opts(
            ("A", "Comprehensive documentation over working software", C),
            ("B", "Individuals and interactions over processes and tools"),
            ("C", "Following a plan over responding to change", C),
            ("D", "Contract negotiation over customer collaboration", C),
        ),
        "B",
    ),
    (
        "Q2",
        "agile",
        "How does an Agile team deliver software?",
        opts(
            ("A", "In one large release at the end of the project", C),
            ("B", "In short iterations that each produce a working increment"),
            ("C", "Only after all requirements are frozen", C),
            ("D", "Without customer feedback until acceptance testing"),
        ),
        "B",
    ),
    (
        "Q3",
        "agile",
        "What is the key difference between Agile and Waterfall?",
        opts(
            ("A", "Waterfall welcomes requirement changes late in the project", C),
            ("B", "Agile plans every phase in detail before any coding starts", C),
            ("C", "Agile uses iterative feedback loops; Waterfall is one sequential pass"),
            ("D", "Waterfall has no testing phase", P),
        ),
        "C",
    ),
    (
        "Q4",
        "scrum",
        "Who is accountable for maximizing product value and ordering the Product Backlog?",
        opts(
            ("A", "The Scrum Master", C),
            ("B", "The Product Owner"),
            ("C", "The Developers", C),
            ("D", "The Project Manager", P),
        ),
        "B",
    ),
    (
        "Q5",
        "scrum",
        "What is the Scrum Master's main responsibility?",
        opts(
            ("A", "Assigning tasks to each developer every day", C),
            ("B", "Writing and prioritizing the requirements", C),
            ("C", "Helping the team apply Scrum and removing impediments"),
            ("D", "Approving the project budget"),
        ),
        "C",
    ),
    (
        "Q6",
        "scrum",
        "Who decides HOW to turn Product Backlog items into a working increment?",
        opts(
            ("A", "The Scrum Master", C),
            ("B", "The Product Owner", C),
            ("C", "The Developers"),
            ("D", "The stakeholders"),
        ),
        "C",
    ),
    (
        "Q7",
        "requirements",
        '"The system shall respond to any search within 2 seconds" is an example of:',
        opts(
            ("A", "A functional requirement", C),
            ("B", "A non-functional (performance) requirement"),
            ("C", "A user story", P),
            ("D", "An acceptance test"),
        ),
        "B",
    ),
    (
        "Q8",
        "requirements",
        "Which of these is a functional requirement?",
        opts(
            ("A", "The system shall let a student download their exam report"),
            ("B", "The system shall be available 99% of the time", C),
            ("C", "Passwords shall be stored hashed", C),
            ("D", "The interface shall be easy to use", C),
        ),
        "A",
    ),
    (
        "Q9",
        "requirements",
        "Which is a complete user story?",
        opts(
            ("A", "As a student, I want to see my weak concepts", I),
            ("B", "As a student, I want to see my weak concepts, so that I know what to review"),
            ("C", "The system shows weak concepts", P),
            ("D", "Weak concepts must load in 2 seconds", C),
        ),
        "B",
    ),
]

# (concept key, usage, source slide page, prompt, options, answer key)
# BR-10: none of these repeat an exam question, and practice/retest never share an item.
BANK: list[tuple[str, str, int, str, list[dict], str]] = [
    # --- Agile: practice
    ("agile", "practice", 2, "Agile values working software over...",
     opts(("A", "Customer collaboration"), ("B", "Comprehensive documentation"),
          ("C", "Individuals and interactions"), ("D", "Responding to change")), "B"),
    ("agile", "practice", 3, "How long is a typical Agile iteration?",
     opts(("A", "1-4 weeks"), ("B", "6-12 months"), ("C", "One day"), ("D", "The whole project")), "A"),
    ("agile", "practice", 4, "In Waterfall, when can the build phase start?",
     opts(("A", "At any time"), ("B", "After the design phase is finished"),
          ("C", "Before requirements are written"), ("D", "Every two weeks")), "B"),
    # --- Agile: retest
    ("agile", "retest", 2, "According to Agile, responding to change is valued over...",
     opts(("A", "Working software"), ("B", "Following a plan"),
          ("C", "Customer collaboration"), ("D", "Individuals")), "B"),
    ("agile", "retest", 3, "What is the main measure of progress in Agile?",
     opts(("A", "Number of documents written"), ("B", "Hours worked"),
          ("C", "Working software"), ("D", "Lines of code")), "C"),
    ("agile", "retest", 4, "Why is a late change expensive in Waterfall?",
     opts(("A", "Earlier phases are already finished and must be redone"), ("B", "There is no customer"),
          ("C", "Testing happens first"), ("D", "Iterations are too short")), "A"),
    # --- Scrum Roles: practice
    ("scrum", "practice", 5, "How many accountabilities does a Scrum Team have?",
     opts(("A", "Two"), ("B", "Three"), ("C", "Four"), ("D", "It depends on team size")), "B"),
    ("scrum", "practice", 6, "The Product Owner decides...",
     opts(("A", "How developers write the code"), ("B", "What is built and in which order"),
          ("C", "Who joins the team"), ("D", "When the Daily Scrum happens")), "B"),
    ("scrum", "practice", 7, "When the team is blocked by another department, who helps remove the impediment?",
     opts(("A", "The Product Owner"), ("B", "The Scrum Master"), ("C", "The customer"), ("D", "Nobody")), "B"),
    # --- Scrum Roles: retest
    ("scrum", "retest", 6, "Who owns the Product Backlog?",
     opts(("A", "The Scrum Master"), ("B", "The Developers"), ("C", "The Product Owner"),
          ("D", "The stakeholders")), "C"),
    ("scrum", "retest", 7, "Which statement about the Scrum Master is TRUE?",
     opts(("A", "They assign daily tasks to developers"), ("B", "They act as the project manager"),
          ("C", "They coach the team in self-management"), ("D", "They order the backlog")), "C"),
    ("scrum", "retest", 8, "Who creates the Sprint Backlog plan of work?",
     opts(("A", "The Developers"), ("B", "The Product Owner"), ("C", "The Scrum Master"),
          ("D", "The customer")), "A"),
    # --- Requirements: practice
    ("requirements", "practice", 9, '"Users can reset their password by email" is a...',
     opts(("A", "Functional requirement"), ("B", "Non-functional requirement"),
          ("C", "Acceptance test"), ("D", "Constraint on hardware")), "A"),
    ("requirements", "practice", 10, "Which is an elicitation technique?",
     opts(("A", "Unit testing"), ("B", "Observation of users at work"), ("C", "Code review"),
          ("D", "Deployment")), "B"),
    ("requirements", "practice", 11, "What do acceptance criteria add to a user story?",
     opts(("A", "A deadline"), ("B", "The developer's name"),
          ("C", "Conditions that make the story testable"), ("D", "The UI design")), "C"),
    # --- Requirements: retest
    ("requirements", "retest", 9, "Availability, security and performance are all...",
     opts(("A", "Functional requirements"), ("B", "Non-functional requirements"),
          ("C", "User stories"), ("D", "Elicitation techniques")), "B"),
    ("requirements", "retest", 10, "Why use more than one elicitation technique?",
     opts(("A", "Stakeholders rarely know every need up front"), ("B", "It is required by law"),
          ("C", "To avoid writing user stories"), ("D", "To skip testing")), "A"),
    ("requirements", "retest", 11, 'In INVEST, the "T" stands for...',
     opts(("A", "Timely"), ("B", "Testable"), ("C", "Technical"), ("D", "Tracked")), "B"),
]

# One AI-generated item left pending review, to demonstrate BR-11 / TC-25.
PENDING_AI_BANK = (
    "scrum", "practice", 5, "[AI draft] Which role is NOT one of the Scrum accountabilities?",
    opts(("A", "Product Owner"), ("B", "Scrum Master"), ("C", "Project Manager"), ("D", "Developers")), "C",
)

INSTRUCTOR = ("Dr. Mona Adel", "instructor@gapmap.test")
OTHER_INSTRUCTOR = ("Dr. Karim Nabil", "instructor2@gapmap.test")  # owns a second course (RBAC demo)
ADMIN = ("System Admin", "admin@gapmap.test")
COORDINATOR = ("Course Coordinator", "coordinator@gapmap.test")

# Synthetic names; student_ref is the pseudonymous id used in the CSV (NFR-02).
STUDENT_NAMES = [
    "Omar Hassan", "Salma Youssef", "Youssef Ali", "Nour Ibrahim", "Ahmed Samir",
    "Mariam Khaled", "Hana Mostafa", "Karim Fathy", "Laila Mahmoud", "Ziad Tarek",
    "Farida Sherif", "Mostafa Gamal", "Jana Wael", "Adam Hesham", "Malak Ayman",
    "Seif Magdy", "Rana Ehab", "Hamza Adel", "Yara Osama", "Ali Reda",
]


def student_ref(index: int) -> str:
    return f"STU{index:03d}"  # 1-based
