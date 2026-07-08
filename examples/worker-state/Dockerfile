FROM node:20-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/result/package.json packages/result/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/workers-state-core/package.json packages/workers-state-core/package.json
COPY packages/workers-core/package.json packages/workers-core/package.json
COPY packages/workers-state-clickhouse/package.json packages/workers-state-clickhouse/package.json
COPY packages/workers-warpstream/package.json packages/workers-warpstream/package.json
COPY examples/worker-state/package.json examples/worker-state/package.json
COPY examples/worker-state/apps/api/package.json examples/worker-state/apps/api/package.json
COPY examples/worker-state/apps/worker/package.json examples/worker-state/apps/worker/package.json
COPY examples/worker-state/apps/dispatcher/package.json examples/worker-state/apps/dispatcher/package.json
COPY examples/worker-state/packages/shared/package.json examples/worker-state/packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY packages/result packages/result
COPY packages/typescript-config packages/typescript-config
COPY packages/workers-state-core packages/workers-state-core
COPY packages/workers-core packages/workers-core
COPY packages/workers-state-clickhouse packages/workers-state-clickhouse
COPY packages/workers-warpstream packages/workers-warpstream
COPY examples/worker-state examples/worker-state

RUN pnpm --filter @alt-stack/result --filter @alt-stack/workers-state-core --filter @alt-stack/workers-core --filter @alt-stack/workers-state-clickhouse --filter @alt-stack/workers-warpstream build
RUN pnpm --filter @worker-state/shared build
RUN pnpm --filter @worker-state/api build
RUN pnpm --filter @worker-state/worker build
RUN pnpm --filter @worker-state/dispatcher build

FROM node:20-bookworm-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY --from=builder /app /app

CMD ["node", "examples/worker-state/apps/api/dist/index.js"]
