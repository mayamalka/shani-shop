import type { z, ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'לא נמצא') => new HttpError(404, 'NOT_FOUND', what);

/** Validate input with a shared zod schema; errors become a 400 with per-field Hebrew messages. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION', issues[0]?.message ?? 'קלט לא תקין', issues);
  }
  return r.data;
}
