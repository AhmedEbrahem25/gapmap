import pymupdf
import pytest


def _pdf_bytes(pages: int = 2) -> bytes:
    doc = pymupdf.open()
    for n in range(1, pages + 1):
        doc.new_page().insert_text((72, 72), f"Test slide {n}\nSome lecture text.")
    data = doc.tobytes()
    doc.close()
    return data


def _upload(client, headers, course_id, name="week1.pdf", data=None, mime="application/pdf"):
    files = {"file": (name, data if data is not None else _pdf_bytes(), mime)}
    return client.post(f"/api/courses/{course_id}/materials", files=files, headers=headers)


def test_tc03_valid_pdf_is_saved_and_processed(client, login, fresh, demo):
    headers = login("instructor@gapmap.test")
    res = _upload(client, headers, demo["course_id"], name="Week 1 Intro.pdf")
    assert res.status_code == 201, res.text
    material = res.json()
    assert material["status"] == "ready"
    assert material["page_count"] == 2
    assert material["filename"] == "Week 1 Intro.pdf"

    page = client.get(f"/api/materials/{material['id']}/pages/2", headers=headers).json()
    assert page["page_number"] == 2 and page["filename"] == "Week 1 Intro.pdf"
    assert "Test slide 2" in page["content"]

    image = client.get(page["image_url"], headers=headers)
    assert image.status_code == 200 and image.headers["content-type"] == "image/png"

    log = client.get(f"/api/courses/{demo['course_id']}/materials", headers=headers).json()
    assert len(log) == 2  # the seeded lecture + this one


@pytest.mark.parametrize(
    ("name", "data", "message"),
    [
        ("notes.docx", b"PK\x03\x04", "Only PDF files"),
        ("fake.pdf", b"hello, not a pdf", "not a valid PDF"),
    ],
)
def test_tc04_unsupported_file_gets_clear_error(client, login, demo, name, data, message):
    res = _upload(client, login("instructor@gapmap.test"), demo["course_id"], name=name, data=data)
    assert res.status_code == 400
    assert message in res.json()["detail"]


def test_oversized_file_is_rejected(client, login, demo, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_upload_mb", 0)
    res = _upload(client, login("instructor@gapmap.test"), demo["course_id"])
    assert res.status_code == 400
    assert "MB limit" in res.json()["detail"]


def test_path_in_filename_is_neutralised(client, login, fresh, demo):
    res = _upload(client, login("instructor@gapmap.test"), demo["course_id"], name="../../evil.pdf")
    assert res.status_code == 201
    assert res.json()["filename"] == "evil.pdf"


def test_student_cannot_upload(client, login, demo):
    res = _upload(client, login("stu001@gapmap.test"), demo["course_id"])
    assert res.status_code == 403


def test_other_instructor_cannot_upload(client, login, demo):
    res = _upload(client, login("instructor2@gapmap.test"), demo["course_id"])
    assert res.status_code == 403


def test_enrolled_student_can_read_a_seeded_page(client, login, demo):
    headers = login("stu001@gapmap.test")
    page = client.get(f"/api/materials/{demo['material_id']}/pages/7", headers=headers)
    assert page.status_code == 200
    body = page.json()
    assert body["title"] == "The Scrum Master"
    assert body["page_count"] == 12
    assert client.get(body["image_url"], headers=headers).status_code == 200


def test_student_from_another_course_cannot_read_pages(client, login, fresh, demo):
    # Enrol nobody in CS204 but upload there, then check an SE301 student is denied.
    material = _upload(client, login("instructor2@gapmap.test"), demo["other_course_id"]).json()
    headers = login("stu001@gapmap.test")
    assert client.get(f"/api/materials/{material['id']}/pages/1", headers=headers).status_code == 403
    assert client.get(f"/api/materials/{material['id']}/pages/1/image", headers=headers).status_code == 403


def test_missing_page_is_404_with_message(client, login, demo):
    res = client.get(f"/api/materials/{demo['material_id']}/pages/99", headers=login("stu001@gapmap.test"))
    assert res.status_code == 404
    assert "Page 99" in res.json()["detail"]
