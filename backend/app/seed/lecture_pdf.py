"""Builds the synthetic demo lecture PDF. Page numbers here are referenced by demo_content.py."""

from pathlib import Path

import pymupdf

LECTURE_FILENAME = "SE_Lecture03_Agile_Scrum_Requirements.pdf"

# (title, bullet lines). Page n of the PDF is PAGES[n - 1].
PAGES: list[tuple[str, list[str]]] = [
    (
        "Software Engineering - Lecture 3",
        [
            "Agile, Scrum Roles and Requirements",
            "",
            "1. Agile values and iterative delivery",
            "2. Agile compared with Waterfall",
            "3. The three Scrum accountabilities",
            "4. Functional and non-functional requirements",
            "5. User stories and acceptance criteria",
        ],
    ),
    (
        "Agile: the four values",
        [
            "Agile teams value:",
            "- Individuals and interactions over processes and tools",
            "- Working software over comprehensive documentation",
            "- Customer collaboration over contract negotiation",
            "- Responding to change over following a plan",
            "",
            "The items on the right still matter; the items on the left matter more.",
        ],
    ),
    (
        "Agile: iterative and incremental delivery",
        [
            "- Work is done in short iterations (typically 1-4 weeks).",
            "- Each iteration produces a working, potentially releasable increment.",
            "- Customers give feedback after every iteration, not only at the end.",
            "- Changing requirements are welcome, even late in development.",
            "- Progress is measured mainly by working software.",
        ],
    ),
    (
        "Agile vs. Waterfall",
        [
            "Waterfall: sequential phases - requirements, design, build, test, deploy.",
            "  Each phase finishes before the next starts; late change is expensive.",
            "",
            "Agile: repeated short cycles that each include planning, building and testing.",
            "  Feedback loops let the team adjust the plan every iteration.",
            "",
            "Key difference: iterative feedback vs. one sequential pass.",
        ],
    ),
    (
        "Scrum: three accountabilities",
        [
            "A Scrum Team has exactly three accountabilities:",
            "- Product Owner: maximizes the value of the product.",
            "- Scrum Master: makes the team effective with Scrum.",
            "- Developers: build a usable increment every Sprint.",
            "",
            "There is no 'project manager' role and no hierarchy inside the team.",
        ],
    ),
    (
        "The Product Owner",
        [
            "- Accountable for maximizing the value of the product.",
            "- Owns and orders (prioritizes) the Product Backlog.",
            "- States the Product Goal and makes backlog items clear.",
            "- One person, not a committee; represents stakeholders' needs.",
            "- Decides WHAT is built and in which order - not HOW.",
        ],
    ),
    (
        "The Scrum Master",
        [
            "- Helps everyone understand Scrum theory and practice.",
            "- Coaches the team in self-management.",
            "- Removes impediments to the team's progress.",
            "- Makes sure Scrum events happen and are productive.",
            "- Is NOT a project manager: does not assign tasks or command the team.",
        ],
    ),
    (
        "The Developers",
        [
            "- The people who create the increment each Sprint.",
            "- Self-managing: they decide HOW to turn backlog items into an increment.",
            "- Create the Sprint Backlog and plan the Sprint's work.",
            "- Hold each other accountable for quality (Definition of Done).",
            "- Include everyone doing the work: coding, testing, design, etc.",
        ],
    ),
    (
        "Requirements: functional vs. non-functional",
        [
            "Functional requirement: something the system must DO.",
            "  e.g. 'The system shall let a student download their report.'",
            "",
            "Non-functional requirement: a QUALITY the system must have.",
            "  Performance, security, availability, usability, maintainability.",
            "  e.g. 'The system shall respond within 2 seconds.'",
        ],
    ),
    (
        "Requirements elicitation techniques",
        [
            "- Interviews with stakeholders",
            "- Questionnaires and surveys",
            "- Observation of users at work",
            "- Workshops and brainstorming",
            "- Prototyping to get early feedback",
            "",
            "Use more than one technique; stakeholders rarely know every need up front.",
        ],
    ),
    (
        "User stories and acceptance criteria",
        [
            "Template: As a <role>, I want <goal>, so that <benefit>.",
            "",
            "Good stories follow INVEST: Independent, Negotiable, Valuable,",
            "Estimable, Small, Testable.",
            "",
            "Acceptance criteria state the conditions that must be true",
            "for the story to be accepted - they make the story testable.",
        ],
    ),
    (
        "Summary",
        [
            "- Agile delivers value in short iterations with continuous feedback.",
            "- Scrum: Product Owner (what), Developers (how), Scrum Master (process).",
            "- Requirements: functional (behaviour) vs. non-functional (quality).",
            "- User stories + acceptance criteria keep requirements testable.",
        ],
    ),
]

_WIDTH, _HEIGHT = 960, 540  # 16:9 slide


def build_lecture_pdf(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    for number, (title, lines) in enumerate(PAGES, start=1):
        page = doc.new_page(width=_WIDTH, height=_HEIGHT)
        page.draw_rect(pymupdf.Rect(0, 0, _WIDTH, 90), color=None, fill=(0.12, 0.23, 0.45))
        page.insert_textbox(
            pymupdf.Rect(48, 26, _WIDTH - 48, 86), title, fontsize=30, fontname="hebo", color=(1, 1, 1)
        )
        page.insert_textbox(
            pymupdf.Rect(60, 120, _WIDTH - 60, _HEIGHT - 60),
            "\n".join(lines),
            fontsize=20,
            fontname="helv",
            color=(0.1, 0.1, 0.1),
            lineheight=1.35,
        )
        page.insert_text(
            (48, _HEIGHT - 24), f"SE Lecture 3  |  Slide {number}", fontsize=11, color=(0.45, 0.45, 0.45)
        )
    doc.save(path)
    doc.close()
