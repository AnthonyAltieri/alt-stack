import { writeFileSync } from "node:fs";
import { generateAsyncAPISpec } from "@alt-stack/kafka";
import { producerRouter } from "./router.js";

// Generate AsyncAPI spec from the producer router
const spec = generateAsyncAPISpec(producerRouter, {
  title: "Example Kafka Producer API",
  version: "1.0.0",
  description: "AsyncAPI specification for the example Kafka producer",
});

// Write the spec to a file
const specPath = "asyncapi.json";
writeFileSync(specPath, JSON.stringify(spec, null, 2));

console.log(`✓ Generated AsyncAPI spec at ${specPath}`);

