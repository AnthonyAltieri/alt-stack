const doc = (id, label) => ({ type: "doc", id, label });

const apiCategory = (items) => ({
  type: "category",
  label: "API Documentation",
  collapsed: true,
  items,
});

const family = (label, root, apiItems, guideItems = []) => ({
  type: "category",
  label,
  collapsed: true,
  items: [
    doc(`${root}/quickstart`, "Quickstart"),
    doc(`${root}/common-patterns`, "Common Patterns"),
    ...guideItems,
    apiCategory(apiItems),
  ],
});

module.exports = {
  tutorialSidebar: [
    doc("intro", "Overview"),
    doc("start/package-map", "Choose Your Packages"),
    family("Result", "result", [doc("result/api", "Result API")]),
    family("CLI", "cli", [doc("cli/api", "CLI API")]),
    family(
      "Servers",
      "server",
      [
        doc("server/api/core", "Core"),
        doc("server/api/hono", "Hono"),
        doc("server/api/express", "Express"),
        doc("server/api/bun", "Bun"),
        doc("server/api/nestjs", "NestJS"),
        doc("server/api/tanstack-start", "TanStack Start"),
      ],
      [doc("server/combine-routers", "Combining Routers")],
    ),
    family("HTTP Clients", "http-client", [
      doc("http-client/api/core", "Core"),
      doc("http-client/api/fetch", "Fetch"),
      doc("http-client/api/ky", "Ky"),
      doc("http-client/api/rust-tokio", "Rust / Tokio"),
    ]),
    family("Kafka", "kafka", [
      doc("kafka/api/core", "Core"),
      doc("kafka/api/client-core", "Client Core"),
      doc("kafka/api/kafkajs", "KafkaJS Client"),
      doc("kafka/api/warpstream", "WarpStream Client"),
    ]),
    family("Workers", "workers", [
      doc("workers/api/core", "Core"),
      doc("workers/api/trigger", "Trigger.dev Runtime"),
      doc("workers/api/warpstream", "WarpStream Runtime"),
      doc("workers/api/client-core", "Client Core"),
      doc("workers/api/client-trigger", "Trigger.dev Client"),
      doc("workers/api/client-warpstream", "WarpStream Client"),
    ]),
    family("Schema & SDK Generation", "codegen", [
      doc("codegen/api/zod-openapi", "OpenAPI → TypeScript / Zod"),
      doc("codegen/api/pydantic-openapi", "OpenAPI → Python / Pydantic"),
      doc("codegen/api/rust-openapi", "OpenAPI → Rust"),
      doc("codegen/api/rust-crate-gen", "Rust Crate Generation"),
      doc("codegen/api/zod-asyncapi", "AsyncAPI → TypeScript / Zod"),
      doc("codegen/api/generated-sdks", "Generated SDK Shape"),
    ]),
    family("Utilities", "utilities", [
      doc("utilities/api", "Zod Error Formatting"),
    ]),
    family("Altstack Together", "together", [
      doc("together/documentation", "Integration Reference"),
    ]),
  ],
};
