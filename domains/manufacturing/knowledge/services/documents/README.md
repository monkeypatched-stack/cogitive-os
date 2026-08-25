# Documents Service

Document metadata, file upload/download, S3/local storage fallback, and document workflow management.

## Local URL

`http://localhost:8029`

## Routes

- `GET /api/v1/document-metadata/`
- `POST /api/v1/document-metadata/`
- `POST /api/v1/document-metadata/upload`
- `POST /api/v1/document-metadata/{document_id}/upload`
- `GET /api/v1/document-metadata/{document_id}/view-link`
- `GET /api/v1/document-metadata/{document_id}/view`
- `GET /api/v1/document-metadata/{document_id}/download`
- `GET /api/v1/document-workflows/`
- `POST /api/v1/document-workflows/`
- `PATCH /api/v1/document-workflows/{workflow_id}`
- `POST /api/v1/document-workflows/{workflow_id}/steps`
- `PATCH /api/v1/document-workflows/{workflow_id}/steps/{step_id}`

## Storage

Uploads try S3 first when `S3_DOCUMENT_BUCKET` or `AWS_S3_BUCKET` is set. If S3 upload fails, files are saved locally under `DOCUMENT_UPLOAD_DIR`, defaulting to `uploads/documents`.
