import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '<rootDir>/lib/**/__tests__/**/*.test.ts',
    '<rootDir>/app/api/**/__tests__/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/**/*.ts',
    '!lib/**/__tests__/**',
    '!app/api/**/__tests__/**',
  ],
  clearMocks: true,
  restoreMocks: true,
};

export default config;
