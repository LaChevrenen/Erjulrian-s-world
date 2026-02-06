import { NotFoundError } from "../domain/errors/NotFoundError";

const handledErrors = [NotFoundError];

export function errorHandler (err, req, res, next) {
  if (handledErrors.some((error) => err instanceof error)) {
    res.status(err.code);
    res.json({ name: err.name, message: err.message });
  }
  res.status(500)
  res.json({ name: 'InternalError', message: err.message });
}