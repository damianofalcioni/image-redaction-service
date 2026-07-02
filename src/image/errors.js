export class ImageRedactionError extends Error {
  constructor(message, statusCode = 400, code = 'IMAGE_REDACTION_ERROR') {
    super(message);
    this.name = 'ImageRedactionError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
