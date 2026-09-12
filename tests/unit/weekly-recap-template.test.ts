import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeeklyRecapEmail,
  type WeeklyRecapLeaderboardRow,
  type WeeklyRecapTemplateInput,
} from "../../apps/web/src/server/email/weekly-recap-template.ts";

const springDstWeek = {
  start: new Date("2026-03-02T01:00:00.000Z"),
  end: new Date("2026-03-09T00:00:00.000Z"),
};

const rows: WeeklyRecapLeaderboardRow[] = [
  {
    athleteId: "athlete-1",
    name: "Avery Stone",
    totalMinutes: 180,
    totalDistance: 42.35,
    avgHr: 146.6,
    status: "MET",
    activityTypes: ["ERG", "RUN"],
    hasHr: true,
    previousWeekMinutes: 160,
    requiredMinutes: 150,
  },
  {
    athleteId: "athlete-2",
    name: "Jordan Lee",
    totalMinutes: 130,
    totalDistance: 31.1,
    avgHr: 151.2,
    status: "NOT_MET",
    activityTypes: ["ERG"],
    hasHr: true,
    previousWeekMinutes: 145,
    requiredMinutes: 150,
    pendingProof: true,
    missingMinutes: true,
  },
  {
    athleteId: "athlete-3",
    name: "Morgan Reed",
    totalMinutes: 110,
    totalDistance: 13.9,
    avgHr: null,
    status: "NOT_MET",
    activityTypes: ["SWIM"],
    hasHr: false,
    previousWeekMinutes: 120,
    requiredMinutes: 150,
    missingProof: true,
    missingMinutes: true,
  },
  {
    athleteId: "athlete-4",
    name: "Taylor Quinn",
    totalMinutes: 0,
    totalDistance: 0,
    avgHr: null,
    status: "EXEMPT",
    activityTypes: [],
    hasHr: false,
    previousWeekMinutes: 0,
    requiredMinutes: 0,
  },
];

const input = (overrides: Partial<WeeklyRecapTemplateInput> = {}): WeeklyRecapTemplateInput => ({
  teamName: "Harbor Rowing",
  weekStartAt: springDstWeek.start,
  weekEndAt: springDstWeek.end,
  teamStats: {
    totalMinutes: 420,
    totalDistance: 87.35,
    avgHr: 146.6,
  },
  rows,
  appUrl: "https://rowbook.example/",
  ...overrides,
});

test("builds an email-safe recap with an exact New York week window and text alternative", () => {
  const result = buildWeeklyRecapEmail(input());

  assert.equal(result.subject, "Harbor Rowing weekly recap · Mar 1–8, 2026");
  assert.match(result.html, /width="600"/);
  assert.match(result.html, /max-width: 600px/);
  assert.match(result.html, /display: none; max-height: 0; overflow: hidden; mso-hide: all/);
  assert.match(result.html, /Mar 1, 2026, 8:00 PM EST/);
  assert.match(result.html, /Mar 8, 2026, 8:00 PM EDT/);
  assert.match(result.html, /1 of 3 athletes met target \(33%\)/);
  assert.match(result.html, />Target met</);
  assert.match(result.html, />Below target</);
  assert.match(result.html, /<th scope="col" align="right" width="94"[^>]*>Status<\/th>/);
  assert.match(result.html, /<td valign="top" align="right" width="94"/);
  assert.match(result.html, /Proof review pending/);
  assert.match(result.html, /Proof rejected — update needed/);
  assert.match(result.html, /Open Rowbook/);
  assert.doesNotMatch(result.html, /display:\s*flex/);

  assert.match(result.text, /HARBOR ROWING WEEKLY RECAP/);
  assert.match(result.text, /Week window: Mar 1, 2026, 8:00 PM EST – Mar 8, 2026, 8:00 PM EDT/);
  assert.match(result.text, /Total minutes: 420 min/);
  assert.match(result.text, /Target completion: 1 of 3 athletes \(33%\)/);
  assert.match(result.text, /Proof review: 1 athlete awaiting review; 1 athlete with rejected proof/);
  assert.match(result.text, /1\. Avery Stone — 180 min · 42\.4 km · 147 bpm · Target met/);
  assert.match(result.text, /Open Rowbook: https:\/\/rowbook\.example\//);
});

test("escapes every HTML value and validates the CTA URL", () => {
  const result = buildWeeklyRecapEmail(
    input({
      teamName: "Harbor <script>& \"Crew\"",
      appUrl: "https://rowbook.example/coach?team=a&week=1",
      rows: [
        {
          ...rows[0],
          name: "Ava <img src=x onerror=\"alert(1)\"> & O'Neil",
        },
      ],
    }),
  );

  assert.doesNotMatch(result.html, /<script>|<img/);
  assert.match(result.html, /Harbor &lt;script&gt;&amp; &quot;Crew&quot;/);
  assert.match(result.html, /Ava &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; O&#39;Neil/);
  assert.match(result.html, /href="https:\/\/rowbook\.example\/coach\?team=a&amp;week=1"/);

  for (const appUrl of [
    "javascript:alert(1)",
    "https://user:secret@rowbook.example/",
    "http://rowbook.example/",
    "not a URL",
  ]) {
    assert.throws(() => buildWeeklyRecapEmail(input({ appUrl })), /CTA URL/);
  }

  const localPreview = buildWeeklyRecapEmail(input({ appUrl: "http://localhost:3000" }));
  assert.match(localPreview.html, /href="http:\/\/localhost:3000\/"/);
});

test("renders a useful empty state without inventing activity", () => {
  const result = buildWeeklyRecapEmail(
    input({
      rows: [],
      teamStats: { totalMinutes: 0, totalDistance: 0, avgHr: null },
    }),
  );

  assert.match(result.html, /No athletes were eligible for target tracking this week\./);
  assert.match(result.html, /No leaderboard entries to show yet\./);
  assert.match(result.html, /No proof reviews are pending and no rejected proof needs attention\./);
  assert.match(result.text, /Target completion: No eligible athletes/);
  assert.match(result.text, /No leaderboard entries to show yet\./);
  assert.doesNotMatch(result.html, /NaN|Infinity|undefined/);
});

test("keeps a 60-athlete recap concise and deterministic", () => {
  const manyRows: WeeklyRecapLeaderboardRow[] = Array.from({ length: 60 }, (_, index) => ({
    athleteId: `athlete-${String(index + 1).padStart(2, "0")}`,
    name: `Athlete ${String(index + 1).padStart(2, "0")} — Zoë 🚣 ${index === 0 ? "A".repeat(120) : ""}`,
    totalMinutes: 600 - index,
    totalDistance: 100 - index / 2,
    avgHr: 140 + (index % 12),
    status: index % 3 === 0 ? "NOT_MET" : "MET",
    activityTypes: index % 2 === 0 ? ["ERG", "RUN"] : ["ERG"],
    hasHr: true,
    previousWeekMinutes: 500 - index,
    requiredMinutes: 550,
    pendingProof: index === 4,
    missingProof: index === 7,
    missingMinutes: index % 3 === 0,
  }));

  const result = buildWeeklyRecapEmail(input({ teamName: "Élite Rowing", rows: manyRows }));

  assert.match(result.html, /Athlete 01 — Zoë 🚣/);
  assert.match(result.html, /Athlete 10 — Zoë 🚣/);
  assert.doesNotMatch(result.html, /Athlete 11 — Zoë 🚣/);
  assert.match(result.html, /50 more athletes are on the full leaderboard\./);
  assert.match(result.text, /50 more athletes are on the full leaderboard\./);
  assert.ok(Buffer.byteLength(result.html, "utf8") < 70_000);
  assert.equal(result.html, buildWeeklyRecapEmail(input({ teamName: "Élite Rowing", rows: manyRows })).html);
});
