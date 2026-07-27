import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RawIracingEventResultExport } from "../types/race-data";
import {
  decodeLicense,
  findTeamCarName,
  isEventResultExport,
  parseEventResultDriverRatings,
  parseEventResultMeta,
} from "./iracing-event-result";

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "__fixtures__/iracing-event-result-sample.json"), "utf-8"),
) as RawIracingEventResultExport;

describe("decodeLicense", () => {
  it("decodes the licence class from the 4-level blocks", () => {
    expect(decodeLicense(20, 499)).toBe("A 4.99");
    expect(decodeLicense(17, 100)).toBe("A 1.00");
    expect(decodeLicense(16, 300)).toBe("B 3.00");
    expect(decodeLicense(11, 250)).toBe("C 2.50");
    expect(decodeLicense(8, 400)).toBe("D 4.00");
    expect(decodeLicense(2, 250)).toBe("R 2.50");
  });

  it("labels levels above A as Pro", () => {
    expect(decodeLicense(21, 499)).toBe("Pro 4.99");
  });

  it("returns undefined for iRacing's -1 'not recorded' marker", () => {
    expect(decodeLicense(-1, -1)).toBeUndefined();
    expect(decodeLicense(0, 400)).toBeUndefined();
  });

  it("omits the safety rating when only the class is known", () => {
    expect(decodeLicense(20, -1)).toBe("A");
  });
});

describe("isEventResultExport", () => {
  it("accepts an event_result export", () => {
    expect(isEventResultExport(fixture)).toBe(true);
  });

  it("rejects a lap-chart export, which is also .json", () => {
    expect(isEventResultExport({ subsession_id: 1, lapData: [] })).toBe(false);
  });

  it("rejects non-objects without throwing", () => {
    expect(isEventResultExport(null)).toBe(false);
    expect(isEventResultExport("event_result")).toBe(false);
    expect(isEventResultExport(42)).toBe(false);
  });
});

describe("parseEventResultDriverRatings", () => {
  it("keys every race driver by cust_id", () => {
    const ratings = parseEventResultDriverRatings(fixture);
    expect([...ratings.keys()].sort()).toEqual([1001, 1002, 2001, 3001]);
  });

  it("ignores drivers who only appear in practice/qualifying sessions", () => {
    const ratings = parseEventResultDriverRatings(fixture);
    // cust_id 9001 exists only in the Open Practice session.
    expect(ratings.has(9001)).toBe(false);
  });

  it("derives iRating change from before/after", () => {
    const ratings = parseEventResultDriverRatings(fixture);
    expect(ratings.get(1001)).toMatchObject({
      driverName: "Alex Driver",
      iRatingBefore: 3000,
      iRatingAfter: 3060,
      iRatingChange: 60,
    });
  });

  it("reports a negative change for a driver who lost rating", () => {
    expect(parseEventResultDriverRatings(fixture).get(1002)?.iRatingChange).toBe(-50);
  });

  it("decodes the licence and safety rating", () => {
    expect(parseEventResultDriverRatings(fixture).get(1001)).toMatchObject({
      license: "A 4.99",
      safetyRating: 4.99,
    });
  });

  it("leaves ratings undefined (not 0 or -1) for an unrated registrant", () => {
    const noshow = parseEventResultDriverRatings(fixture).get(3001)!;
    expect(noshow.driverName).toBe("Noshow Registrant");
    expect(noshow.iRatingBefore).toBeUndefined();
    expect(noshow.iRatingAfter).toBeUndefined();
    expect(noshow.iRatingChange).toBeUndefined();
    expect(noshow.license).toBeUndefined();
    expect(noshow.safetyRating).toBeUndefined();
  });
});

describe("parseEventResultMeta", () => {
  it("pulls the event context the lap-chart export doesn't carry", () => {
    expect(parseEventResultMeta(fixture)).toMatchObject({
      subsessionId: 55500002,
      seriesName: "Test Endurance Series",
      trackName: "Test Circuit",
      trackConfig: "Endurance",
      strengthOfField: 2500,
      numDrivers: 5,
      numLeadChanges: 3,
      lapsComplete: 40,
    });
  });

  it("ranks our split strongest-first among all splits", () => {
    // SoFs are 3200 / 2500 / 1400; ours (55500002) is 2500 -> 2nd of 3.
    expect(parseEventResultMeta(fixture)).toMatchObject({ splitRank: 2, splitCount: 3 });
  });

  it("scopes class SoF to the car class asked for", () => {
    expect(parseEventResultMeta(fixture, 1000)).toMatchObject({
      classStrengthOfField: 2600,
      classEntries: 2,
    });
    expect(parseEventResultMeta(fixture, 2000)).toMatchObject({
      classStrengthOfField: 1800,
      classEntries: 1,
    });
  });

  it("leaves class SoF undefined rather than guessing when no class is given", () => {
    const meta = parseEventResultMeta(fixture);
    expect(meta.classStrengthOfField).toBeUndefined();
    expect(meta.classEntries).toBeUndefined();
  });
});

describe("findTeamCarName", () => {
  it("finds the car a team ran", () => {
    expect(findTeamCarName(fixture, -1001)).toBe("Test GT3 Car");
    expect(findTeamCarName(fixture, -1002)).toBe("Other GT3 Car");
  });

  it("returns undefined for an unknown team", () => {
    expect(findTeamCarName(fixture, -9999)).toBeUndefined();
  });
});
