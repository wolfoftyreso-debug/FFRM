import "server-only";

import { getApolloCredentials } from "@/lib/providers/config";
import { testApolloApiKey } from "@/lib/apollo/client";

export async function testApolloConnection(): Promise<void> {
  const { apiKey } = await getApolloCredentials();
  await testApolloApiKey(apiKey);
}
