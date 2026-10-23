import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page", () => {
  it("renders the sample mission, its waypoints and the local-only notice", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("Make progress");
    expect(html).toContain("Ship portfolio utilities");
    expect(html).toContain("Base64 + hash tools");
    expect(html).toContain("33%");
    expect(html).toContain("NO SYNC / THIS BROWSER");
    expect(html).toContain("localStorage only");
  });
});
