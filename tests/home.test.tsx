import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page", () => {
  it("renders the sample goal, its steps, progress and the local-only note on the App shell", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("Active goals");
    expect(html).toContain("Ship portfolio utilities");
    expect(html).toContain("Base64 + hash tools");
    expect(html).toContain("1 of 3 steps done");
    expect(html).toContain("33% average progress");
    expect(html).toContain("In progress");
    expect(html).toContain('aria-valuenow="33"');
    expect(html).toContain("Saved in this browser only");
  });
});
