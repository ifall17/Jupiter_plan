"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
const business_constants_1 = require("../constants/business.constants");
class BaseRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    paginate(page = 1, limit = business_constants_1.DEFAULT_PAGE_LIMIT) {
        return {
            skip: (page - 1) * limit,
            take: limit,
        };
    }
}
exports.BaseRepository = BaseRepository;
//# sourceMappingURL=base.repository.js.map