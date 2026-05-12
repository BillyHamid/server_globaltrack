"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
exports.validateQuery = validateQuery;
function validate(schema) {
    return (req, _res, next) => {
        req.body = schema.parse(req.body);
        next();
    };
}
function validateQuery(schema) {
    return (req, _res, next) => {
        req.query = schema.parse(req.query);
        next();
    };
}
//# sourceMappingURL=validate.middleware.js.map