export const healthPayload = () => ({
  status: "UP" as const,
  testMode: process.env.TEST_MODE === "true",
});
