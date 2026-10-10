import { describe, expect, it } from "vitest";

import { cleanSubject, draftFromSubjects } from "./commit-notes.mjs";

describe("cleanSubject", () => {
  it("strips type and scope, capitalizes, drops the trailing period", () => {
    expect(cleanSubject("feat(share): deep-link shared forecasts.")).toBe(
      "Deep-link shared forecasts",
    );
  });

  it("leaves subjects without a conventional prefix alone", () => {
    expect(cleanSubject("Plain line")).toBe("Plain line");
  });
});

describe("draftFromSubjects", () => {
  it("groups feat/fix/style into New/Fixed/Polish sections in order", () => {
    const md = draftFromSubjects([
      "fix(nowcast): default zoom 12 on both nowcast maps",
      "feat(share): deep-link shared forecasts to the sender's location",
      "style(alerts): gray border for warning-icon chips",
      "copy(ui): shorten the load-map prompt",
    ]);
    expect(md).toBe(
      [
        "### New",
        "",
        "- Deep-link shared forecasts to the sender's location",
        "",
        "### Fixed",
        "",
        "- Default zoom 12 on both nowcast maps",
        "",
        "### Polish",
        "",
        "- Gray border for warning-icon chips",
        "- Shorten the load-map prompt",
      ].join("\n"),
    );
  });

  it("skips merges, chores, docs, tests, and review-round nits", () => {
    expect(
      draftFromSubjects([
        "Merge pull request #153 from homingli/staging",
        "Merge remote-tracking branch 'origin/main' into HEAD",
        "chore(release): v0.8.4",
        "docs: correct testing-strategy counts",
        "test: pin yAxisId on day/night areas",
        "fix(share): review round 1 — snapshot guard, 2-decimal coords",
      ]),
    ).toBe("");
  });

  it("keeps the section order even when a type is missing", () => {
    expect(draftFromSubjects(["feat(egg): holiday confetti"])).toBe(
      "### New\n\n- Holiday confetti",
    );
  });
});
