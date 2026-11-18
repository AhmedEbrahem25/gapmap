"""Word (.docx) -> PDF, so Word lectures go through the same page pipeline as PDFs.

A .docx has no fixed pages (Word lays them out when it opens the file), so we define them:
the document is split at its page breaks, or at Heading 1/2 when it has none. Each part
starts on a new page of the generated PDF. The part's text is kept straight from the Word
file, because text extracted back out of a generated PDF garbles Arabic.
"""

import html
import io
import re
from dataclasses import dataclass

import mammoth
import pymupdf

_PAGE_BREAK = re.compile(r'(?:<p>)?<hr class="page-break" />(?:</p>)?')
_HEADING_START = re.compile(r"(?=<h[12][ >])")
_BLOCK_END = re.compile(r"</(?:p|h[1-6]|li|tr)>|<br\s*/?>")
_TAG = re.compile(r"<[^>]+>")
_IMG = re.compile(r"<img[^>]*>")

_CSS = """
body { font-family: sans-serif; font-size: 12pt; line-height: 1.4; color: #1a1a1a; }
h1 { font-size: 22pt; color: #1f3b73; margin-bottom: 8pt; }
h2 { font-size: 17pt; color: #1f3b73; margin-bottom: 6pt; }
h3 { font-size: 14pt; margin-bottom: 4pt; }
p { margin-bottom: 6pt; }
li { margin-bottom: 3pt; }
table { border-collapse: collapse; }
td, th { border: 1px solid #999; padding: 3pt; }
"""
_PAGE = pymupdf.paper_rect("a4")
_MARGIN = 54  # 0.75 inch


class DocxError(Exception):
    """The file could not be read as a Word document; the message says why."""


@dataclass(frozen=True)
class ConvertedDocx:
    pdf: bytes
    pages: list[tuple[str | None, str]]  # (title, text) for each PDF page


def docx_to_pdf(data: bytes) -> ConvertedDocx:
    try:
        # Images are dropped in the MVP: the text is what we index and link to.
        result = mammoth.convert_to_html(io.BytesIO(data), style_map="br[type='page'] => hr.page-break")
    except Exception as exc:
        raise DocxError("This Word file could not be read. Save it again as .docx or export it to PDF.") from exc

    parts = [p for p in _split(_IMG.sub("", result.value)) if _text(p)]
    if not parts:
        raise DocxError("This Word file has no text to show.")

    out = io.BytesIO()
    writer = pymupdf.DocumentWriter(out)
    pages: list[tuple[str | None, str]] = []
    where = _PAGE + (_MARGIN, _MARGIN, -_MARGIN, -_MARGIN)
    for part in parts:
        story = pymupdf.Story(html=part, user_css=_CSS)
        text = _text(part)
        title = text.splitlines()[0][:300] if text else None
        more = True
        while more:
            device = writer.begin_page(_PAGE)
            more, _ = story.place(where)
            story.draw(device)
            writer.end_page()
            # A part longer than a page keeps its whole text on each of its pages.
            pages.append((title, text))
    writer.close()
    return ConvertedDocx(out.getvalue(), pages)


def _split(body: str) -> list[str]:
    if _PAGE_BREAK.search(body):
        return _PAGE_BREAK.split(body)
    return _HEADING_START.split(body)


def _text(fragment: str) -> str:
    text = html.unescape(_TAG.sub("", _BLOCK_END.sub("\n", fragment)))
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())
