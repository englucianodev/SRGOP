export class AppError extends Error {
  constructor(message, status = 400, origin = 'Regra de negócio') {
    super(message);
    this.status = status;
    this.origin = origin;
  }
}
export function requireValue(condition, message, status = 400, origin) {
  if (!condition) throw new AppError(message, status, origin);
}
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
