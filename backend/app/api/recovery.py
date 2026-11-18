import uuid

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession, can_access_course, get_accessible_course
from app.models import BankQuestion, Concept, Course, RecoveryPlan, RecoveryTask, Retest, User
from app.models.enums import BankUsage, ReviewStatus, Role
from app.schemas.recovery import (
    BankQuestionOut,
    PracticeCheckIn,
    PracticeCheckOut,
    RecoveryPlanOut,
    RetestCreate,
    RetestOut,
    RetestResults,
    RetestSubmit,
)
from app.services import recovery
from app.services.recovery import RecoveryError

router = APIRouter(tags=["recovery"])


@router.get("/recovery-plans/{plan_id}", response_model=RecoveryPlanOut)
def get_plan(plan_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RecoveryPlanOut:
    return recovery.plan_view(db, _readable_plan(db, user, plan_id))


@router.post("/recovery-tasks/{task_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
def complete_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    task = db.get(RecoveryTask, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    _own_plan(db, user, task.plan_id)
    recovery.complete_task(db, task)


@router.get("/concepts/{concept_id}/practice", response_model=list[BankQuestionOut])
def practice(concept_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[BankQuestionOut]:
    concept = db.get(Concept, concept_id)
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Concept not found.")
    get_accessible_course(db, user, concept.course_id)
    return recovery.practice_questions(db, concept.id)


@router.post("/practice/{bank_question_id}/check", response_model=PracticeCheckOut)
def check_practice(bank_question_id: uuid.UUID, body: PracticeCheckIn, user: CurrentUser, db: DbSession) -> PracticeCheckOut:
    item = db.get(BankQuestion, bank_question_id)
    # Pending or retest items are not practice: answering them here would leak retest keys.
    if item is None or item.usage != BankUsage.PRACTICE or item.review_status != ReviewStatus.APPROVED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Practice question not found.")
    get_accessible_course(db, user, db.get(Concept, item.concept_id).course_id)
    return recovery.check_practice(db, item, body.answer)


@router.post("/retests", response_model=RetestOut, status_code=status.HTTP_201_CREATED)
def create_retest(body: RetestCreate, user: CurrentUser, db: DbSession) -> RetestOut:
    plan = _own_plan(db, user, body.recovery_plan_id)
    try:
        return recovery.retest_view(db, recovery.start_retest(db, plan))
    except RecoveryError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None


@router.get("/retests/{retest_id}", response_model=RetestOut)
def get_retest(retest_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RetestOut:
    retest = _retest(db, retest_id)
    _readable_plan(db, user, retest.plan_id)
    return recovery.retest_view(db, retest)


@router.post("/retests/{retest_id}/submit", response_model=RetestResults)
def submit_retest(retest_id: uuid.UUID, body: RetestSubmit, user: CurrentUser, db: DbSession) -> RetestResults:
    retest = _retest(db, retest_id)
    _own_plan(db, user, retest.plan_id)
    try:
        recovery.submit_retest(db, retest, body.answers)
        return recovery.retest_results(db, retest)
    except RecoveryError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None


@router.get("/retests/{retest_id}/results", response_model=RetestResults)
def get_retest_results(retest_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RetestResults:
    retest = _retest(db, retest_id)
    _readable_plan(db, user, retest.plan_id)
    try:
        return recovery.retest_results(db, retest)
    except RecoveryError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None


def _plan(db: DbSession, plan_id: uuid.UUID) -> RecoveryPlan:
    plan = db.get(RecoveryPlan, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recovery plan not found.")
    return plan


def _own_plan(db: DbSession, user: User, plan_id: uuid.UUID) -> RecoveryPlan:
    """Only the student the plan belongs to may act on it."""
    plan = _plan(db, plan_id)
    if plan.student_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This recovery plan belongs to another student.")
    return plan


def _readable_plan(db: DbSession, user: User, plan_id: uuid.UUID) -> RecoveryPlan:
    """The plan's student, or the course instructor / an admin (not coordinators: TC-27)."""
    plan = _plan(db, plan_id)
    if plan.student_id == user.id:
        return plan
    course = db.get(Course, plan.course_id)
    if user.role in (Role.INSTRUCTOR, Role.ADMIN) and can_access_course(db, user, course):
        return plan
    raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this recovery plan.")


def _retest(db: DbSession, retest_id: uuid.UUID) -> Retest:
    retest = db.get(Retest, retest_id)
    if retest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Retest not found.")
    return retest
