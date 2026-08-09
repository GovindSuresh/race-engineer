import { describe, expect, it } from "vitest";
import type { RawGarage61Lap } from "../types/race-data";
import { garage61SessionTypeLabel, groupG61ApiLapsIntoSessions } from "./g61-sessions";

/** Invented names/ids only — never real Garage61 data. */
function makeLap(overrides: Partial<RawGarage61Lap> = {}): RawGarage61Lap {
  return {
    lapTime: 138.4,
    lapNumber: 1,
    startTime: "2026-03-04T18:00:00Z",
    event: "evt-alpha",
    session: 1,
    sessionType: 1,
    fuelLevel: 90,
    fuelUsed: 3.5,
    driver: { slug: "sam-vance", firstName: "Sam", lastName: "Vance" },
    car: { id: 77, name: "Invented GT3" },
    track: { id: 401, name: "Testburg", variant: "Grand Prix" },
    ...overrides,
  };
}

describe("groupG61ApiLapsIntoSessions", () => {
  it("groups on Garage61's own event + session identity", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({ event: "evt-alpha", session: 1, startTime: "2026-03-04T18:00:00Z" }),
      makeLap({ event: "evt-alpha", session: 1, startTime: "2026-03-04T18:02:00Z" }),
      makeLap({ event: "evt-beta", session: 1, startTime: "2026-03-05T18:00:00Z" }),
    ]);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.lapCount)).toEqual([1, 2]);
  });

  it("separates two sessions of the same event", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({ event: "evt-alpha", session: 1 }),
      makeLap({ event: "evt-alpha", session: 2 }),
    ]);
    expect(sessions).toHaveLength(2);
  });

  it("returns newest first — the session you just drove is the one you want", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({ event: "old", startTime: "2026-03-01T18:00:00Z" }),
      makeLap({ event: "new", startTime: "2026-03-09T18:00:00Z" }),
      makeLap({ event: "mid", startTime: "2026-03-05T18:00:00Z" }),
    ]);
    expect(sessions.map((s) => s.event)).toEqual(["new", "mid", "old"]);
  });

  // Both identity fields can be dropped by Go's `omitempty`. Without a
  // fallback every unidentified lap would collapse into one "session",
  // running two practice days together into a single lap sequence — which
  // moves stint boundaries and makes the pace trend meaningless.
  describe("when the API supplies no session identity", () => {
    const anonymous = (startTime: string, lapNumber: number) =>
      makeLap({ event: undefined, session: undefined, startTime, lapNumber });

    it("splits on a gap longer than an hour", () => {
      const sessions = groupG61ApiLapsIntoSessions([
        anonymous("2026-03-04T18:00:00Z", 1),
        anonymous("2026-03-04T18:05:00Z", 2),
        anonymous("2026-03-04T21:00:00Z", 1),
      ]);
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.lapCount)).toEqual([1, 2]);
    });

    it("keeps laps together across a normal in-session break", () => {
      const sessions = groupG61ApiLapsIntoSessions([
        anonymous("2026-03-04T18:00:00Z", 1),
        anonymous("2026-03-04T18:40:00Z", 2),
      ]);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].lapCount).toBe(2);
    });

    it("does not bridge two anonymous stretches through an identified session between them", () => {
      const sessions = groupG61ApiLapsIntoSessions([
        anonymous("2026-03-04T18:00:00Z", 1),
        makeLap({ event: "evt-alpha", session: 9, startTime: "2026-03-04T18:10:00Z" }),
        anonymous("2026-03-04T18:20:00Z", 2),
      ]);
      expect(sessions).toHaveLength(3);
    });
  });

  it("lists every driver that shared the session, in first-appearance order", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({
        startTime: "2026-03-04T18:00:00Z",
        driver: { firstName: "Sam", lastName: "Vance" },
      }),
      makeLap({
        startTime: "2026-03-04T18:02:00Z",
        driver: { firstName: "Ada", lastName: "Roon" },
      }),
      makeLap({
        startTime: "2026-03-04T18:04:00Z",
        driver: { firstName: "Sam", lastName: "Vance" },
      }),
    ]);
    expect(sessions[0].drivers).toEqual(["Sam Vance", "Ada Roon"]);
  });

  it("reports the fastest timed lap in ms, ignoring laps with no time", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({ startTime: "2026-03-04T18:00:00Z", lapTime: 0 }),
      makeLap({ startTime: "2026-03-04T18:02:00Z", lapTime: 140.5 }),
      makeLap({ startTime: "2026-03-04T18:04:00Z", lapTime: 138.25 }),
    ]);
    expect(sessions[0].bestLapTimeMs).toBe(138250);
  });

  it("reports 0 rather than Infinity when nothing was timed", () => {
    const sessions = groupG61ApiLapsIntoSessions([makeLap({ lapTime: 0 })]);
    expect(sessions[0].bestLapTimeMs).toBe(0);
  });

  it("takes car and track from whichever lap reports them", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({ startTime: "2026-03-04T18:00:00Z", car: undefined, track: undefined }),
      makeLap({ startTime: "2026-03-04T18:02:00Z" }),
    ]);
    expect(sessions[0].carName).toBe("Invented GT3");
    expect(sessions[0].trackName).toBe("Testburg — Grand Prix");
  });

  it("spans startedAt to endedAt across the session's laps", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({ startTime: "2026-03-04T18:00:00Z" }),
      makeLap({ startTime: "2026-03-04T18:30:00Z" }),
    ]);
    expect(sessions[0].startedAt).toBe("2026-03-04T18:00:00Z");
    expect(sessions[0].endedAt).toBe("2026-03-04T18:30:00Z");
  });

  it("hands back rows in lap order, ready for garage61OnlyToLapRecords", () => {
    const sessions = groupG61ApiLapsIntoSessions([
      makeLap({ lapNumber: 2, startTime: "2026-03-04T18:02:00Z" }),
      makeLap({ lapNumber: 1, startTime: "2026-03-04T18:00:00Z" }),
    ]);
    expect(sessions[0].rows.map((row) => row.lap)).toEqual([1, 2]);
  });

  it("returns nothing for an empty response", () => {
    expect(groupG61ApiLapsIntoSessions([])).toEqual([]);
  });
});

describe("garage61SessionTypeLabel", () => {
  it("labels the API's session types", () => {
    expect(garage61SessionTypeLabel(1)).toBe("Practice");
    expect(garage61SessionTypeLabel(2)).toBe("Qualifying");
    expect(garage61SessionTypeLabel(3)).toBe("Race");
  });

  it("falls back for an absent or unrecognised type", () => {
    expect(garage61SessionTypeLabel(null)).toBe("Session");
    expect(garage61SessionTypeLabel(99)).toBe("Session");
  });
});
