"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalSetup;
const path = require("path");
const dotenv = require("dotenv");
async function globalSetup() {
    dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });
    if (!process.env.REDIS_PASSWORD && process.env.REDIS_URL) {
        try {
            const parsed = new URL(process.env.REDIS_URL);
            process.env.REDIS_PASSWORD = parsed.password;
        }
        catch {
            throw new Error('REDIS_URL is malformed.');
        }
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required for integration tests.');
    }
    if (!databaseUrl.toLowerCase().includes('test')) {
        throw new Error('Unsafe DATABASE_URL detected. Integration tests require a test database URL.');
    }
    if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'test';
    }
}
//# sourceMappingURL=setup-integration.js.map