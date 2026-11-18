"""Reset the database to the demo state.

    python -m app.seed               # demo data + an approved results import (S3 can start now)
    python -m app.seed --no-results  # demo data only; import the CSV live through the UI (S2)
"""

import argparse

from app.core.config import settings
from app.core.db import SessionLocal, create_all, drop_all
from app.seed import demo_content as dc
from app.seed.demo import clear_storage, seed_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset GapMap to the demo state.")
    parser.add_argument("--no-results", action="store_true", help="skip the pre-approved results import")
    args = parser.parse_args()

    drop_all()
    create_all()
    clear_storage()
    with SessionLocal() as db:
        summary = seed_demo(db, with_results=not args.no_results)

    print("GapMap demo data ready.")
    print(f"  students: {summary['students']}  slides: {summary['slides']}  answers: {summary['answers']}")
    print("  password for every demo account: DEMO_PASSWORD (see .env)")
    print(f"  instructor:  {dc.INSTRUCTOR[1]}")
    print(f"  student:     stu001@gapmap.test  (... stu{len(dc.STUDENT_NAMES):03d}@gapmap.test)")
    print(f"  coordinator: {dc.COORDINATOR[1]}   admin: {dc.ADMIN[1]}")
    print(f"  database: {settings.database_url.split('@')[-1]}")


if __name__ == "__main__":
    main()
