"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeptGuard = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/enums");
let DeptGuard = class DeptGuard {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user?.role) {
            throw new common_1.ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
        }
        if (user.role !== enums_1.UserRole.CONTRIBUTEUR) {
            return true;
        }
        const scopeDepartments = new Set((user.department_scope ?? []).filter((scope) => scope.can_read).map((scope) => scope.department));
        const lineDepartments = request.body?.lines?.map((line) => line.department).filter((value) => Boolean(value)) ?? [];
        if (lineDepartments.length > 0) {
            const unauthorized = lineDepartments.some((department) => !scopeDepartments.has(department));
            if (unauthorized) {
                throw new common_1.ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
            }
            return true;
        }
        const resourceDepartment = request.resource?.department ?? request.body?.department ?? request.params?.department;
        if (!resourceDepartment || !scopeDepartments.has(resourceDepartment)) {
            throw new common_1.ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
        }
        return true;
    }
};
exports.DeptGuard = DeptGuard;
exports.DeptGuard = DeptGuard = __decorate([
    (0, common_1.Injectable)()
], DeptGuard);
//# sourceMappingURL=dept.guard.js.map