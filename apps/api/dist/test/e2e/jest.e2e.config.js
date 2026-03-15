"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '../..',
    testRegex: '.*\\.e2e\\.spec\\.ts$',
    moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    },
    transform: { '^.+\\.(t|j)s$': 'ts-jest' },
    testEnvironment: 'node',
    globalSetup: './test/setup-integration.ts',
    testTimeout: 60000,
    maxWorkers: 1,
    verbose: true,
};
//# sourceMappingURL=jest.e2e.config.js.map