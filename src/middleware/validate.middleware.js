/** @typedef {import('zod').ZodSchema} ZodSchema */

export function validate(schema) {
  return (req, _res, next) => {
    req.body = schema.parse(req.body)
    next()
  }
}

export function validateQuery(schema) {
  return (req, _res, next) => {
    req.query = schema.parse(req.query)
    next()
  }
}
