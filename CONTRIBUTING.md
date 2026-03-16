# Contributing to Exe Computer Use

Thank you for your interest in contributing. This guide covers everything you need to get started.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Adding a New Operator](#adding-a-new-operator)
- [Package Development](#package-development)
- [Commit Message Convention](#commit-message-convention)

---

## Development Setup

```bash
# Clone the repository
git clone https://github.com/AskExe/exe-computer-use.git
cd exe-computer-use

# Install all dependencies (requires pnpm >= 9.10)
pnpm install

# Start the app in development mode
pnpm dev
```

The app launches with hot reload enabled. Changes to the renderer (React) are reflected immediately; changes to the main process trigger an automatic restart.

For full system requirements and configuration, see the [Getting Started](./docs/getting-started.md) guide.

## Project Structure

Exe Computer Use is a monorepo managed with pnpm workspaces and Turbo. The key areas are:

| Directory | Description |
|-----------|-------------|
| `apps/ui-tars/` | Electron desktop application (main + renderer + preload) |
| `packages/ui-tars/sdk/` | GUIAgent engine -- the core agent loop |
| `packages/ui-tars/action-parser/` | Parses VLM text predictions into structured actions |
| `packages/ui-tars/shared/` | Shared types, constants, and utilities |
| `packages/ui-tars/electron-ipc/` | Type-safe IPC channel definitions |
| `packages/ui-tars/operators/` | Platform operators (nut-js, browser, ADB) |
| `packages/agent-infra/` | Infrastructure (browser control, MCP, logging) |

For a detailed architecture overview, see [docs/architecture.md](./docs/architecture.md).

## Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes.** Write tests for new functionality.

3. **Run checks** before committing:
   ```bash
   # Lint the entire project
   pnpm lint

   # Run tests
   pnpm test

   # Type-check the Electron app
   cd apps/ui-tars && npm run typecheck
   ```

4. **Commit** with a [conventional commit message](#commit-message-convention):
   ```bash
   git commit -m "feat: add keyboard shortcut operator"
   ```

5. **Push** and open a pull request against `main`.

## Code Style

The project enforces consistent code style through ESLint and Prettier, configured in `@common/configs`.

### Guidelines

- **TypeScript strict mode** is enabled across all packages.
- Use **`logger.*`** (from `electron-log` or `@agent-infra/logger`) for all logging. Do not use `console.*` directly.
- **Prefer explicit error handling** over silent catches. When catching errors, log them with context and re-throw or handle appropriately.
- **Imports** are sorted automatically by `@trivago/prettier-plugin-sort-imports`.
- Use **workspace dependencies** (`workspace:*`) when referencing other packages in the monorepo.

### Formatting

```bash
# Format all files with Prettier
pnpm format

# Lint and auto-fix
pnpm lint
```

## Testing

The project uses **Vitest** for unit tests and **Playwright** for end-to-end tests.

### Running Tests

```bash
# Run all unit tests from the project root
pnpm test

# Run tests for a specific package
cd packages/ui-tars/action-parser && pnpm test

# Run Electron app tests
cd apps/ui-tars && npm test

# Run tests with coverage
pnpm coverage

# Run E2E tests (requires a built app)
cd apps/ui-tars
npm run build:e2e
npm run test:e2e
```

### Writing Tests

- Place test files adjacent to the source file with a `.test.ts` suffix (e.g., `dHash.test.ts`).
- Use descriptive test names that explain the expected behavior.
- Mock external dependencies (API calls, file system, child processes).

## Adding a New Operator

Operators are the abstraction layer between the GUIAgent and the target platform. To add a new operator:

1. **Create a new package** under `packages/ui-tars/operators/`:
   ```
   packages/ui-tars/operators/my-operator/
   ├── src/
   │   └── index.ts
   ├── package.json
   └── tsconfig.json
   ```

2. **Implement the `Operator` abstract class** from `@ui-tars/sdk`:
   ```typescript
   import { Operator } from '@ui-tars/sdk/core';
   import type { ScreenshotOutput, ExecuteParams, ExecuteOutput } from '@ui-tars/sdk';

   export class MyOperator extends Operator {
     static MANUAL = {
       ACTION_SPACES: [
         'click(start_box="(x1, y1, x2, y2)")',
         'type(content="text")',
         // ... declare supported actions
       ],
     };

     async screenshot(): Promise<ScreenshotOutput> {
       // Capture the current visual state
       // Return { base64: '...', scaleFactor: 2 }
     }

     async execute(params: ExecuteParams): Promise<ExecuteOutput> {
       // Execute the parsed action on your platform
     }
   }
   ```

3. **Register the operator** in `apps/ui-tars/src/main/services/runAgent.ts` by adding it to the operator switch statement.

4. **Add to the operator enum** in the store types so it appears in the Settings UI.

5. **Write tests** covering screenshot capture and each supported action type.

## Package Development

Each package in the monorepo builds independently.

### Key Commands

```bash
# Build all packages (run from the repo root)
pnpm prepare

# Build a specific package
cd packages/ui-tars/sdk && pnpm build

# Watch mode for a package during development
cd packages/ui-tars/sdk && pnpm dev
```

### Dependency Management

- Use `workspace:*` for inter-package dependencies in `package.json`.
- Run `pnpm install` from the repo root to link workspace packages.
- Each package uses `rslib` or a similar tool for building. Check the individual `package.json` for available scripts.

### Adding a New Package

1. Create the package directory under `packages/`.
2. Add a `package.json` with the appropriate `name` and `version`.
3. Add the package to the workspace (`pnpm-workspace.yaml` typically covers `packages/**`).
4. Run `pnpm install` from the root to register the new package.

## Commit Message Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification, enforced by commitlint.

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat:` | New feature | `feat: add Android ADB operator` |
| `fix:` | Bug fix | `fix: resolve screenshot scaling on Retina displays` |
| `docs:` | Documentation only | `docs: update Getting Started guide` |
| `chore:` | Maintenance, tooling, CI | `chore: upgrade Electron to v34` |
| `perf:` | Performance improvement | `perf: optimize dHash computation` |
| `test:` | Test additions or fixes | `test: add loop detector unit tests` |
| `refactor:` | Code restructuring (no behavior change) | `refactor: extract IPC route handlers` |
| `style:` | Formatting, whitespace | `style: fix Prettier violations` |

Write commit messages that explain **why** the change was made, not just what was changed. The subject line should be under 72 characters. Use the body for additional context when needed.
