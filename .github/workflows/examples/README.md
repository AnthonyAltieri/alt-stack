# GitHub Workflow Examples

This directory contains example GitHub Actions workflows that you can copy and adapt for your own projects.

## Usage

These workflows are **not executed** by GitHub Actions (workflows in subdirectories are ignored). To use one:

1. Copy the workflow file to `.github/workflows/` (the parent directory)
2. Customize it for your project's needs
3. Commit and push - GitHub Actions will run it automatically

## Available Examples

### `publish-openapi-schema.yml`

A workflow that:
- Starts a server
- Fetches the OpenAPI schema
- Generates TypeScript types using `@alt-stack/zod-openapi`
- Publishes the schema and types as an npm package

This is useful for automatically publishing OpenAPI schemas and generated types whenever your API changes.

