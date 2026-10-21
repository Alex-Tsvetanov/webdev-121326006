import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // Entry points and the Postgres adapter need a running server or database. They are
      // checked by starting the app against Neon (README.md), not by unit tests.
      exclude: ['src/main.js', 'src/db/pg-repo.js', 'src/db/migrate.js'],
      reporter: ['text', 'html'],
      thresholds: {
        // The overall gate: 80% of everything else.
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // The service layer holds the rules, so every line, function and branch is checked.
        'src/services/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
