import io

import docx

from app.core.config import settings

ARABIC = "النمط هو حل قابل لإعادة الاستخدام لمشكلة شائعة."


def _docx(*, page_breaks: bool, long_part: bool = False) -> bytes:
    d = docx.Document()
    d.add_heading("Design Patterns", 1)
    d.add_paragraph("A design pattern is a reusable solution to a common problem.")
    d.add_paragraph("Creational", style="List Bullet")
    if page_breaks:
        d.add_page_break()
    d.add_heading("أنماط التصميم", 1)
    d.add_paragraph(ARABIC)
    if page_breaks:
        d.add_page_break()
    d.add_heading("Observer", 2)
    d.add_paragraph("Observer notifies dependents when state changes. " * (200 if long_part else 3))
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _upload(client, login, course_id, data, name="Lecture 4.docx"):
    files = {"file": (name, data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    return client.post(f"/api/courses/{course_id}/materials", files=files, headers=login("instructor@gapmap.test"))


def test_word_file_becomes_pages_split_at_page_breaks(client, login, fresh, demo):
    res = _upload(client, login, demo["course_id"], _docx(page_breaks=True))
    assert res.status_code == 201, res.text
    material = res.json()
    assert material["status"] == "ready" and material["file_type"] == "docx"
    assert material["filename"] == "Lecture 4.docx"
    assert material["page_count"] == 3

    headers = login("stu001@gapmap.test")
    pages = [client.get(f"/api/materials/{material['id']}/pages/{n}", headers=headers).json() for n in (1, 2, 3)]
    assert [p["title"] for p in pages] == ["Design Patterns", "أنماط التصميم", "Observer"]
    assert pages[0]["file_type"] == "docx"
    assert "Creational" in pages[0]["content"]
    assert ARABIC in pages[1]["content"]  # text comes from Word, not from the generated PDF
    assert client.get(pages[1]["image_url"], headers=headers).status_code == 200

    folder = settings.storage_dir / "materials" / material["id"]
    assert (folder / "Lecture 4.docx").is_file() and (folder / "Lecture 4.pdf").is_file()


def test_word_file_without_page_breaks_splits_at_headings(client, login, fresh, demo):
    material = _upload(client, login, demo["course_id"], _docx(page_breaks=False)).json()
    assert material["page_count"] == 3  # Heading 1, Heading 1, Heading 2


def test_long_part_flows_onto_more_pages_and_keeps_its_text(client, login, fresh, demo):
    material = _upload(client, login, demo["course_id"], _docx(page_breaks=True, long_part=True)).json()
    assert material["page_count"] > 3
    last = client.get(
        f"/api/materials/{material['id']}/pages/{material['page_count']}", headers=login("stu001@gapmap.test")
    ).json()
    assert last["title"] == "Observer"


def test_word_file_with_no_text_is_rejected(client, login, demo):
    buf = io.BytesIO()
    docx.Document().save(buf)
    res = _upload(client, login, demo["course_id"], buf.getvalue(), name="empty.docx")
    assert res.status_code == 400
    assert "no text" in res.json()["detail"]
