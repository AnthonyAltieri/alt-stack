import { createProducer } from "@alt-stack/kafka-core";
import { Kafka } from "kafkajs";
import { env } from "./env.js";
import { producerRouter } from "./router.js";

// ============================================================================
// Main
// ============================================================================

async function main() {
  const brokers = env.KAFKA_BROKERS.split(",");
  const clientId = env.KAFKA_CLIENT_ID;

  console.log(`Connecting to Kafka brokers: ${brokers.join(", ")}`);
  console.log(`Client ID: ${clientId}`);

  const kafka = new Kafka({
    clientId,
    brokers,
  });

  const producer = await createProducer(producerRouter, {
    kafka,
    onError: (error) => {
      console.error("Producer error:", error);
    },
  });

  console.log("Kafka producer connected and ready to send messages...");

  // Example: Send some messages
  try {
    // Send a user created event
    await producer.send("user-events", {
      userId: "user-123",
      eventType: "created",
      timestamp: Date.now(),
      metadata: { source: "example-producer" },
    });
    console.log("✓ Sent user-events message");

    // Send an order created event
    await producer.send("orders/created", {
      orderId: "order-456",
      userId: "user-123",
      items: [
        { productId: "prod-1", quantity: 2, price: 29.99 },
        { productId: "prod-2", quantity: 1, price: 49.99 },
      ],
      total: 109.97,
    });
    console.log("✓ Sent orders/created message");

    // Send a notification
    await producer.send("notifications", {
      type: "email",
      recipient: "user@example.com",
      message: "Your order has been placed!",
    });
    console.log("✓ Sent notifications message");

    // Send a batch of user events
    await producer.sendBatch("user-events", [
      { userId: "user-124", eventType: "created", timestamp: Date.now() },
      { userId: "user-125", eventType: "created", timestamp: Date.now() },
      { userId: "user-123", eventType: "updated", timestamp: Date.now() },
    ]);
    console.log("✓ Sent batch of user-events messages");
  } catch (error) {
    console.error("Failed to send message:", error);
  }

  // Keep the process running for a bit to show it's working
  console.log("\nAll messages sent! Disconnecting in 2 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await producer.disconnect();
  console.log("Producer disconnected");
}

main().catch((error) => {
  console.error("Failed to start producer:", error);
  process.exit(1);
});

