"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditAction = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "SUPER_ADMIN";
    UserRole["FPA"] = "FPA";
    UserRole["CONTRIBUTEUR"] = "CONTRIBUTEUR";
    UserRole["LECTEUR"] = "LECTEUR";
})(UserRole || (exports.UserRole = UserRole = {}));
var AuditAction;
(function (AuditAction) {
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["BUDGET_CREATE"] = "BUDGET_CREATE";
    AuditAction["BUDGET_SUBMIT"] = "BUDGET_SUBMIT";
    AuditAction["BUDGET_APPROVE"] = "BUDGET_APPROVE";
    AuditAction["BUDGET_REJECT"] = "BUDGET_REJECT";
    AuditAction["BUDGET_LOCK"] = "BUDGET_LOCK";
    AuditAction["IMPORT_START"] = "IMPORT_START";
    AuditAction["IMPORT_DONE"] = "IMPORT_DONE";
    AuditAction["PERIOD_CLOSE"] = "PERIOD_CLOSE";
    AuditAction["SCENARIO_SAVE"] = "SCENARIO_SAVE";
    AuditAction["EXPORT"] = "EXPORT";
    AuditAction["AUDIT_ACCESS_CREATE"] = "AUDIT_ACCESS_CREATE";
    AuditAction["AUDIT_ACCESS_REVOKE"] = "AUDIT_ACCESS_REVOKE";
    AuditAction["USER_CREATE"] = "USER_CREATE";
    AuditAction["USER_UPDATE"] = "USER_UPDATE";
    AuditAction["USER_DEACTIVATE"] = "USER_DEACTIVATE";
    AuditAction["USER_ACTIVATE"] = "USER_ACTIVATE";
    AuditAction["PASSWORD_CHANGE"] = "PASSWORD_CHANGE";
    AuditAction["BALANCE_UPDATE"] = "BALANCE_UPDATE";
    AuditAction["TRANSACTION_VALIDATE"] = "TRANSACTION_VALIDATE";
    AuditAction["TRANSACTION_DELETE"] = "TRANSACTION_DELETE";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
//# sourceMappingURL=index.js.map