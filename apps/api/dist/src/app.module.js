"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const throttler_1 = require("@nestjs/throttler");
const configuration_1 = require("./config/configuration");
const prisma_module_1 = require("./prisma/prisma.module");
const redis_module_1 = require("./redis/redis.module");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const budgets_module_1 = require("./modules/budgets/budgets.module");
const cash_flow_module_1 = require("./modules/cash-flow/cash-flow.module");
const bank_accounts_module_1 = require("./modules/bank-accounts/bank-accounts.module");
const scenarios_module_1 = require("./modules/scenarios/scenarios.module");
const kpis_module_1 = require("./modules/kpis/kpis.module");
const alerts_module_1 = require("./modules/alerts/alerts.module");
const dashboard_module_1 = require("./modules/dashboard/dashboard.module");
const fiscal_years_module_1 = require("./modules/fiscal-years/fiscal-years.module");
const transactions_module_1 = require("./modules/transactions/transactions.module");
const imports_module_1 = require("./modules/imports/imports.module");
const periods_module_1 = require("./modules/periods/periods.module");
const comments_module_1 = require("./modules/comments/comments.module");
const jwt_throttler_guard_1 = require("./common/guards/jwt-throttler.guard");
const app_controller_1 = require("./app.controller");
function validateEnv(env) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET is required');
    }
    if (!env.JWT_REFRESH_SECRET) {
        throw new Error('JWT_REFRESH_SECRET is required');
    }
    if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required');
    }
    if (!env.REDIS_PASSWORD) {
        throw new Error('REDIS_PASSWORD is required');
    }
    if (!env.WEB_URL) {
        throw new Error('WEB_URL is required');
    }
    const origins = env.WEB_URL.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (origins.length === 0) {
        throw new Error('WEB_URL must contain at least one origin');
    }
    for (const origin of origins) {
        try {
            new URL(origin);
        }
        catch {
            throw new Error(`WEB_URL contains invalid origin: ${origin}`);
        }
    }
    return env;
}
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [app_controller_1.AppController],
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true, load: [configuration_1.default], validate: validateEnv }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60000,
                    limit: 100,
                },
            ]),
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            bullmq_1.BullModule.forRoot({
                connection: {
                    url: process.env.REDIS_URL,
                    password: process.env.REDIS_PASSWORD,
                },
            }),
            bullmq_1.BullModule.registerQueue({ name: 'import-queue' }, { name: 'calc-queue' }, { name: 'notif-queue' }, { name: 'export-queue' }),
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            budgets_module_1.BudgetsModule,
            cash_flow_module_1.CashFlowModule,
            bank_accounts_module_1.BankAccountsModule,
            scenarios_module_1.ScenariosModule,
            kpis_module_1.KpisModule,
            alerts_module_1.AlertsModule,
            dashboard_module_1.DashboardModule,
            fiscal_years_module_1.FiscalYearsModule,
            transactions_module_1.TransactionsModule,
            imports_module_1.ImportsModule,
            periods_module_1.PeriodsModule,
            comments_module_1.CommentsModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_throttler_guard_1.JwtThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map