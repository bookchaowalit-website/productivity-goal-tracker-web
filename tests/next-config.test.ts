import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config redirects", () => {
  it("sends the retired /more-projects page to the main site for good", async () => {
    expect(await nextConfig.redirects!()).toContainEqual({ source: "/more-projects", destination: "https://bookchaowalit.com/", permanent: true });
  });
});
