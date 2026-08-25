class DocumentOcrError(Exception):
    pass


async def extract_document_text_with_qwen_ocr(*args, **kwargs):
    raise DocumentOcrError("OCR module not implemented")
