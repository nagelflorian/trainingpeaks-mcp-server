import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkoutStructure,
  wrapWorkoutBlocks,
  resolveStructure,
  computeStructureMetrics,
} from "./workouts.js";
import type { WorkoutStructure, StructureStep } from "./workouts.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parse(input: Parameters<typeof buildWorkoutStructure>[0]): WorkoutStructure {
  return JSON.parse(buildWorkoutStructure(input)) as WorkoutStructure;
}

const WARMUP = {
  name: "Warm Up",
  type: "step" as const,
  duration_seconds: 1200,
  intensity_min: 40,
  intensity_max: 50,
  intensityClass: "warmUp" as const,
};

const COOLDOWN = {
  name: "Cool Down",
  type: "step" as const,
  duration_seconds: 600,
  intensity_min: 40,
  intensity_max: 50,
  intensityClass: "coolDown" as const,
};

// ─── Structure root ────────────────────────────────────────────────────────────

describe("buildWorkoutStructure — root fields", () => {
  it("sets primaryLengthMetric to duration", () => {
    const r = parse({ steps: [WARMUP] });
    assert.equal(r.primaryLengthMetric, "duration");
  });

  it("defaults primaryIntensityMetric to percentOfFtp", () => {
    const r = parse({ steps: [WARMUP] });
    assert.equal(r.primaryIntensityMetric, "percentOfFtp");
  });

  it("respects explicit primaryIntensityMetric", () => {
    const r = parse({ primaryIntensityMetric: "percentOfThresholdPace", steps: [WARMUP] });
    assert.equal(r.primaryIntensityMetric, "percentOfThresholdPace");
  });

  it("sets primaryIntensityTargetOrRange to range", () => {
    const r = parse({ steps: [WARMUP] });
    assert.equal(r.primaryIntensityTargetOrRange, "range");
  });
});

// ─── Step blocks ──────────────────────────────────────────────────────────────

describe("buildWorkoutStructure — step blocks", () => {
  it("wraps a step in a block with length {value:1, unit:repetition}", () => {
    const r = parse({ steps: [WARMUP] });
    const block = r.structure[0];
    assert.equal(block.type, "step");
    assert.deepEqual(block.length, { value: 1, unit: "repetition" });
  });

  it("sets intensityClass and openDuration on inner step", () => {
    const r = parse({ steps: [WARMUP] });
    const step = r.structure[0].steps[0];
    assert.equal(step.intensityClass, "warmUp");
    assert.equal(step.openDuration, false);
  });

  it("does NOT add type field to inner steps of step blocks", () => {
    const r = parse({ steps: [WARMUP] });
    const step = r.structure[0].steps[0];
    assert.equal((step as { type?: unknown }).type, undefined);
  });

  it("builds target without unit field for primary intensity", () => {
    const r = parse({ steps: [WARMUP] });
    const target = r.structure[0].steps[0].targets[0];
    assert.equal(target.minValue, 40);
    assert.equal(target.maxValue, 50);
    assert.equal((target as { unit?: unknown }).unit, undefined);
  });

  it("adds cadence target with unit field when specified", () => {
    const r = parse({
      steps: [
        {
          name: "Ride",
          type: "step",
          duration_seconds: 3600,
          intensity_min: 60,
          intensity_max: 80,
          intensityClass: "active",
          cadence_min: 85,
          cadence_max: 95,
        },
      ],
    });
    const targets = r.structure[0].steps[0].targets;
    assert.equal(targets.length, 2);
    assert.equal(targets[1].minValue, 85);
    assert.equal(targets[1].maxValue, 95);
    assert.equal(targets[1].unit, "roundOrStridePerMinute");
  });

  it("defaults intensityClass to active when omitted", () => {
    const r = parse({
      steps: [
        { name: "Ride", type: "step", duration_seconds: 600, intensity_min: 70, intensity_max: 80 },
      ],
    });
    assert.equal(r.structure[0].steps[0].intensityClass, "active");
  });
});

// ─── Repetition blocks ────────────────────────────────────────────────────────

describe("buildWorkoutStructure — repetition blocks", () => {
  it("sets type:repetition and correct length", () => {
    const r = parse({
      steps: [
        {
          name: "Intervals",
          type: "repetition",
          reps: 5,
          steps: [
            {
              name: "Hard",
              duration_seconds: 300,
              intensity_min: 90,
              intensity_max: 100,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 120,
              intensity_min: 50,
              intensity_max: 60,
              intensityClass: "rest",
            },
          ],
        },
      ],
    });
    const block = r.structure[0];
    assert.equal(block.type, "repetition");
    assert.deepEqual(block.length, { value: 5, unit: "repetition" });
  });

  it("adds type:'step' to inner steps of repetition blocks", () => {
    const r = parse({
      steps: [
        {
          name: "Intervals",
          type: "repetition",
          reps: 3,
          steps: [
            {
              name: "Hard",
              duration_seconds: 60,
              intensity_min: 90,
              intensity_max: 100,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 30,
              intensity_min: 50,
              intensity_max: 60,
              intensityClass: "rest",
            },
          ],
        },
      ],
    });
    for (const step of r.structure[0].steps) {
      assert.equal((step as StructureStep & { type?: string }).type, "step");
    }
  });

  it("sets intensityClass on each inner step", () => {
    const r = parse({
      steps: [
        {
          name: "Intervals",
          type: "repetition",
          reps: 1,
          steps: [
            {
              name: "Hard",
              duration_seconds: 60,
              intensity_min: 90,
              intensity_max: 100,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 30,
              intensity_min: 50,
              intensity_max: 60,
              intensityClass: "rest",
            },
          ],
        },
      ],
    });
    assert.equal(r.structure[0].steps[0].intensityClass, "active");
    assert.equal(r.structure[0].steps[1].intensityClass, "rest");
  });
});

// ─── begin / end offsets ──────────────────────────────────────────────────────

describe("buildWorkoutStructure — begin/end offsets", () => {
  it("first block starts at 0", () => {
    const r = parse({ steps: [WARMUP] });
    assert.equal(r.structure[0].begin, 0);
  });

  it("step block end = begin + duration_seconds", () => {
    const r = parse({ steps: [WARMUP] });
    assert.equal(r.structure[0].end, 1200);
  });

  it("repetition block end = begin + reps * sum(inner durations)", () => {
    // 4 reps × (300s + 120s) = 1680s
    const r = parse({
      steps: [
        {
          name: "Intervals",
          type: "repetition",
          reps: 4,
          steps: [
            {
              name: "Hard",
              duration_seconds: 300,
              intensity_min: 90,
              intensity_max: 100,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 120,
              intensity_min: 50,
              intensity_max: 60,
              intensityClass: "rest",
            },
          ],
        },
      ],
    });
    assert.equal(r.structure[0].begin, 0);
    assert.equal(r.structure[0].end, 1680);
  });

  it("blocks are contiguous — each begin equals previous end", () => {
    const r = parse({
      steps: [
        WARMUP, // 0–1200
        {
          name: "Intervals",
          type: "repetition",
          reps: 3,
          steps: [
            {
              name: "Hard",
              duration_seconds: 300,
              intensity_min: 90,
              intensity_max: 100,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 120,
              intensity_min: 50,
              intensity_max: 60,
              intensityClass: "rest",
            },
          ],
        }, // 1200–2460
        COOLDOWN, // 2460–3060
      ],
    });
    assert.equal(r.structure[0].begin, 0);
    assert.equal(r.structure[0].end, 1200);
    assert.equal(r.structure[1].begin, 1200);
    assert.equal(r.structure[1].end, 2460); // 1200 + 3*(300+120) = 2460
    assert.equal(r.structure[2].begin, 2460);
    assert.equal(r.structure[2].end, 3060);
  });
});

// ─── Polyline ─────────────────────────────────────────────────────────────────

describe("buildWorkoutStructure — polyline", () => {
  it("starts with [0, 0]", () => {
    const r = parse({ steps: [WARMUP] });
    assert.deepEqual(r.polyline[0], [0, 0]);
  });

  it("ends with [1, 0]", () => {
    const r = parse({ steps: [WARMUP] });
    assert.deepEqual(r.polyline[r.polyline.length - 1], [1, 0]);
  });

  it("single uniform-intensity step fills the full x range at y=1", () => {
    // Only one step — it becomes the maximum intensity, so y = 1.0
    const r = parse({
      steps: [
        {
          name: "Ride",
          type: "step",
          duration_seconds: 3600,
          intensity_min: 60,
          intensity_max: 80,
          intensityClass: "active",
        },
      ],
    });
    // Expected: [0,0], [0,1], [1,1], [1,0]
    assert.deepEqual(r.polyline, [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ]);
  });

  it("normalizes y to max maxValue across all steps", () => {
    // Warmup max=50, Hard max=100 → normalization denominator=100
    // Warmup y = 50/100 = 0.5, Hard y = 100/100 = 1.0
    const r = parse({
      steps: [
        {
          name: "Warm Up",
          type: "step",
          duration_seconds: 600,
          intensity_min: 40,
          intensity_max: 50,
          intensityClass: "warmUp",
        },
        {
          name: "Hard",
          type: "step",
          duration_seconds: 600,
          intensity_min: 80,
          intensity_max: 100,
          intensityClass: "active",
        },
      ],
    });
    // Total 1200s; each step = 0.5 of total
    // [0,0], [0,0.5], [0.5,0.5], [0.5,0], [0.5,1], [1,1], [1,0]
    assert.deepEqual(r.polyline, [
      [0, 0],
      [0, 0.5],
      [0.5, 0.5],
      [0.5, 0],
      [0.5, 1],
      [1, 1],
      [1, 0],
    ]);
  });

  it("rounds x and y values to 3 decimal places", () => {
    // 1s step in a 3s total → x = 1/3 = 0.333...
    const r = parse({
      steps: [
        {
          name: "A",
          type: "step",
          duration_seconds: 1,
          intensity_min: 50,
          intensity_max: 75,
          intensityClass: "active",
        },
        {
          name: "B",
          type: "step",
          duration_seconds: 2,
          intensity_min: 50,
          intensity_max: 100,
          intensityClass: "active",
        },
      ],
    });
    // x_end of A = 1/3 = 0.333
    const xEndA = r.polyline[2][0];
    assert.equal(xEndA, 0.333);
  });

  it("expands repetition block — each rep produces its own trace", () => {
    // 2 reps × (60s hard + 30s easy) = 180s total
    const r = parse({
      steps: [
        {
          name: "Intervals",
          type: "repetition",
          reps: 2,
          steps: [
            {
              name: "Hard",
              duration_seconds: 60,
              intensity_min: 80,
              intensity_max: 100,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 30,
              intensity_min: 40,
              intensity_max: 50,
              intensityClass: "rest",
            },
          ],
        },
      ],
    });
    // Total = 180s; max y = 100
    // Rep 1: Hard 0–60s (x: 0–0.333), Easy 60–90s (x: 0.333–0.5)
    // Rep 2: Hard 90–150s (x: 0.5–0.833), Easy 150–180s (x: 0.833–1.0)
    assert.deepEqual(r.polyline, [
      [0, 0],
      [0, 1],
      [0.333, 1],
      [0.333, 0],
      [0.333, 0.5],
      [0.5, 0.5],
      [0.5, 0],
      [0.5, 1],
      [0.833, 1],
      [0.833, 0],
      [0.833, 0.5],
      [1, 0.5],
      [1, 0],
    ]);
  });

  it("multi-step with recovery — 3×13×(30s+15s) — matches captured TP request exactly", () => {
    // This is the real workout captured from Safari devtools.
    const r = parse({
      primaryIntensityMetric: "percentOfFtp",
      steps: [
        {
          name: "Warm up",
          type: "step",
          duration_seconds: 1200,
          intensity_min: 40,
          intensity_max: 50,
          intensityClass: "warmUp",
        },
        {
          name: "Set 1",
          type: "repetition",
          reps: 13,
          steps: [
            {
              name: "Hard",
              duration_seconds: 30,
              intensity_min: 85,
              intensity_max: 95,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 15,
              intensity_min: 0,
              intensity_max: 55,
              intensityClass: "rest",
            },
          ],
        },
        {
          name: "Recovery",
          type: "step",
          duration_seconds: 300,
          intensity_min: 50,
          intensity_max: 60,
          intensityClass: "rest",
        },
        {
          name: "Set 2",
          type: "repetition",
          reps: 13,
          steps: [
            {
              name: "Hard",
              duration_seconds: 30,
              intensity_min: 85,
              intensity_max: 95,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 15,
              intensity_min: 0,
              intensity_max: 55,
              intensityClass: "rest",
            },
          ],
        },
        {
          name: "Recovery",
          type: "step",
          duration_seconds: 300,
          intensity_min: 0,
          intensity_max: 55,
          intensityClass: "rest",
        },
        {
          name: "Set 3",
          type: "repetition",
          reps: 13,
          steps: [
            {
              name: "Hard",
              duration_seconds: 30,
              intensity_min: 85,
              intensity_max: 95,
              intensityClass: "active",
            },
            {
              name: "Easy",
              duration_seconds: 15,
              intensity_min: 50,
              intensity_max: 60,
              intensityClass: "rest",
            },
          ],
        },
        {
          name: "Cool down",
          type: "step",
          duration_seconds: 900,
          intensity_min: 40,
          intensity_max: 50,
          intensityClass: "coolDown",
        },
      ],
    });

    // First 10 and last 3 points from the real Safari devtools capture
    const capturedFirst10: [number, number][] = [
      [0, 0],
      [0, 0.526],
      [0.269, 0.526],
      [0.269, 0],
      [0.269, 1],
      [0.276, 1],
      [0.276, 0],
      [0.276, 0.579],
      [0.279, 0.579],
      [0.279, 0],
    ];
    const capturedLast3: [number, number][] = [
      [0.798, 0.526],
      [1, 0.526],
      [1, 0],
    ];

    assert.deepEqual(r.polyline.slice(0, 10), capturedFirst10);
    assert.deepEqual(r.polyline.slice(-3), capturedLast3);
    assert.equal(r.polyline.length, 247);
  });
});

// ─── wrapWorkoutBlocks ────────────────────────────────────────────────────────

function wrap(input: Parameters<typeof wrapWorkoutBlocks>[0]): WorkoutStructure {
  return JSON.parse(wrapWorkoutBlocks(input)) as WorkoutStructure;
}

describe("wrapWorkoutBlocks — pre-built TP wire-format blocks", () => {
  // Representative of what the LLM generates when it pre-builds the TP structure:
  // a step block wrapping one inner step already in wire format.
  const WIRE_WARMUP = {
    type: "step" as const,
    length: { value: 1, unit: "repetition" },
    steps: [
      {
        name: "Warm Up",
        length: { value: 1200, unit: "second" },
        targets: [{ minValue: 50, maxValue: 65 }],
        intensityClass: "warmUp" as const,
        openDuration: false,
      },
    ],
    begin: 0,
    end: 0, // will be recomputed
  };

  const WIRE_COOLDOWN = {
    type: "step" as const,
    length: { value: 1, unit: "repetition" },
    steps: [
      {
        name: "Cool Down",
        length: { value: 600, unit: "second" },
        targets: [{ minValue: 40, maxValue: 55 }],
        intensityClass: "coolDown" as const,
        openDuration: false,
      },
    ],
    begin: 0,
    end: 0,
  };

  it("preserves name, targets, and intensityClass from inner steps", () => {
    const r = wrap({ steps: [WIRE_WARMUP] });
    const inner = r.structure[0].steps[0];
    assert.equal(inner.name, "Warm Up");
    assert.deepEqual(inner.targets, [{ minValue: 50, maxValue: 65 }]);
    assert.equal(inner.intensityClass, "warmUp");
  });

  it("preserves length.value on inner steps", () => {
    const r = wrap({ steps: [WIRE_WARMUP] });
    assert.equal(r.structure[0].steps[0].length.value, 1200);
  });

  it("recomputes begin/end — step block", () => {
    const r = wrap({ steps: [WIRE_WARMUP] });
    assert.equal(r.structure[0].begin, 0);
    assert.equal(r.structure[0].end, 1200);
  });

  it("recomputes begin/end — blocks are contiguous", () => {
    const r = wrap({ steps: [WIRE_WARMUP, WIRE_COOLDOWN] });
    assert.equal(r.structure[0].begin, 0);
    assert.equal(r.structure[0].end, 1200);
    assert.equal(r.structure[1].begin, 1200);
    assert.equal(r.structure[1].end, 1800);
  });

  it("preserves rep count (length.value) on repetition blocks", () => {
    const repBlock = {
      type: "repetition" as const,
      length: { value: 13, unit: "repetition" },
      steps: [
        {
          name: "Hard",
          length: { value: 30, unit: "second" },
          targets: [{ minValue: 85, maxValue: 95 }],
          intensityClass: "active" as const,
          openDuration: false,
        },
        {
          name: "Easy",
          length: { value: 15, unit: "second" },
          targets: [{ minValue: 0, maxValue: 55 }],
          intensityClass: "rest" as const,
          openDuration: false,
        },
      ],
      begin: 0,
      end: 0,
    };
    const r = wrap({ steps: [repBlock] });
    assert.equal(r.structure[0].length.value, 13);
    assert.equal(r.structure[0].end, 13 * (30 + 15)); // 585
  });

  it("respects explicit primaryIntensityMetric", () => {
    const r = wrap({ primaryIntensityMetric: "percentOfThresholdPace", steps: [WIRE_WARMUP] });
    assert.equal(r.primaryIntensityMetric, "percentOfThresholdPace");
  });

  it("builds a non-empty polyline", () => {
    const r = wrap({ steps: [WIRE_WARMUP] });
    assert.ok(r.polyline.length > 0);
    assert.deepEqual(r.polyline[0], [0, 0]);
    assert.deepEqual(r.polyline[r.polyline.length - 1], [1, 0]);
  });
});

// ─── intensityClass mapping tests ─────────────────────────────────────────────

describe("buildWorkoutStructure — intensityClass recovery mapping", () => {
  it("maps 'recovery' to 'rest' in the wire format", () => {
    const result = buildWorkoutStructure({
      steps: [
        {
          name: "Recovery",
          duration_seconds: 300,
          intensity_min: 40,
          intensity_max: 55,
          intensityClass: "recovery",
        },
      ],
    });
    const parsed = JSON.parse(result) as WorkoutStructure;
    assert.equal(parsed.structure[0].steps[0].intensityClass, "rest");
  });

  it("preserves other intensityClass values unchanged", () => {
    const result = buildWorkoutStructure({
      steps: [
        {
          name: "WU",
          duration_seconds: 600,
          intensity_min: 40,
          intensity_max: 55,
          intensityClass: "warmUp",
        },
        {
          name: "Work",
          duration_seconds: 300,
          intensity_min: 90,
          intensity_max: 100,
          intensityClass: "active",
        },
      ],
    });
    const parsed = JSON.parse(result) as WorkoutStructure;
    assert.equal(parsed.structure[0].steps[0].intensityClass, "warmUp");
    assert.equal(parsed.structure[1].steps[0].intensityClass, "active");
  });
});

// ─── Validation error tests ──────────────────────────────────────────────────

describe("buildWorkoutStructure — validation errors", () => {
  it("throws on empty steps array", () => {
    assert.throws(() => buildWorkoutStructure({ steps: [] }), /at least one step/);
  });

  it("throws on step with no duration_seconds", () => {
    assert.throws(
      () => buildWorkoutStructure({ steps: [{ name: "Bad", duration_seconds: 0 }] }),
      /duration_seconds/
    );
  });

  it("throws on repetition with empty inner steps", () => {
    assert.throws(
      () =>
        buildWorkoutStructure({
          steps: [{ name: "Bad Rep", type: "repetition", reps: 3, steps: [] }],
        }),
      /at least one inner interval/
    );
  });

  it("throws on repetition inner step with no duration", () => {
    assert.throws(
      () =>
        buildWorkoutStructure({
          steps: [
            {
              name: "Rep",
              type: "repetition",
              reps: 3,
              steps: [{ name: "No Duration", duration_seconds: 0 }],
            },
          ],
        }),
      /duration_seconds/
    );
  });
});

describe("wrapWorkoutBlocks — validation errors", () => {
  it("throws on empty steps array", () => {
    assert.throws(() => wrapWorkoutBlocks({ steps: [] }), /at least one step/);
  });

  it("throws on block with missing steps", () => {
    const badBlock = {
      type: "step" as const,
      length: { value: 1, unit: "repetition" },
      begin: 0,
      end: 0,
    };
    assert.throws(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => wrapWorkoutBlocks({ steps: [badBlock as any] }),
      /no steps array/
    );
  });
});

// ─── resolveStructure tests ─────────────────────────────────────────────────

describe("resolveStructure", () => {
  const wireStep = {
    type: "step" as const,
    length: { value: 1, unit: "repetition" },
    steps: [
      {
        name: "Warm Up",
        length: { value: 1200, unit: "second" },
        targets: [{ minValue: 50, maxValue: 65 }],
        intensityClass: "warmUp" as const,
        openDuration: false,
      },
    ],
    begin: 0,
    end: 1200,
  };

  it("handles simple format (duration_seconds)", () => {
    const input = JSON.stringify({
      steps: [{ name: "Easy", duration_seconds: 600, intensity_min: 50, intensity_max: 60 }],
    });
    const result = JSON.parse(resolveStructure(input)) as WorkoutStructure;
    assert.equal(result.structure.length, 1);
    assert.equal(result.structure[0].steps[0].name, "Easy");
  });

  it("handles wire format (length.unit)", () => {
    const input = JSON.stringify({ steps: [wireStep] });
    const result = JSON.parse(resolveStructure(input)) as WorkoutStructure;
    assert.equal(result.structure.length, 1);
    assert.equal(result.structure[0].begin, 0);
  });

  it("handles WorkoutStructure with 'structure' key at root", () => {
    const input = JSON.stringify({
      structure: [wireStep],
      primaryIntensityMetric: "percentOfFtp",
    });
    const result = JSON.parse(resolveStructure(input)) as WorkoutStructure;
    assert.equal(result.structure.length, 1);
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => resolveStructure("not json{"), /not valid JSON/);
  });

  it("throws on non-object input", () => {
    assert.throws(() => resolveStructure('"just a string"'), /must be a JSON object/);
  });

  it("throws on object with no steps", () => {
    assert.throws(() => resolveStructure('{"foo": "bar"}'), /must have a "steps" array/);
  });

  it("throws on ambiguous format (no known fields)", () => {
    assert.throws(
      () => resolveStructure(JSON.stringify({ steps: [{ name: "Mystery" }] })),
      /Could not determine structure format/
    );
  });
});

// ─── computeStructureMetrics tests ──────────────────────────────────────────

describe("computeStructureMetrics", () => {
  it("computes IF and TSS matching the TP web app for a known workout", () => {
    // This workout was captured from the TP web app:
    // Warm up 1200s 40-50%, 4×(360s hard 85-95% + 180s easy 50-60%), Recovery 300s 50-60%, Cool down 600s 40-50%
    // Web app computed: IF=0.71, TSS=60.2, totalTimePlanned=1.1833...
    const structure: WorkoutStructure = JSON.parse(
      buildWorkoutStructure({
        primaryIntensityMetric: "percentOfFtp",
        steps: [
          {
            name: "Warm up",
            duration_seconds: 1200,
            intensity_min: 40,
            intensity_max: 50,
            intensityClass: "warmUp",
          },
          {
            name: "Intervals",
            type: "repetition",
            reps: 4,
            steps: [
              {
                name: "Hard",
                duration_seconds: 360,
                intensity_min: 85,
                intensity_max: 95,
                intensityClass: "active",
              },
              {
                name: "Easy",
                duration_seconds: 180,
                intensity_min: 50,
                intensity_max: 60,
                intensityClass: "rest",
              },
            ],
          },
          {
            name: "Recovery",
            duration_seconds: 300,
            intensity_min: 50,
            intensity_max: 60,
            intensityClass: "rest",
          },
          {
            name: "Cool down",
            duration_seconds: 600,
            intensity_min: 40,
            intensity_max: 50,
            intensityClass: "coolDown",
          },
        ],
      })
    );

    const metrics = computeStructureMetrics(structure);
    assert.ok(metrics);
    assert.equal(metrics.totalSeconds, 4260);
    assert.equal(metrics.ifPlanned, 0.71); // matches web app
    // TSS should be close to 60.2 (web app value)
    assert.ok(
      metrics.tssPlanned >= 59.5 && metrics.tssPlanned <= 61.0,
      `TSS ${metrics.tssPlanned} should be close to 60.2`
    );
  });

  it("returns null for empty structure", () => {
    const structure: WorkoutStructure = {
      structure: [],
      polyline: [],
      primaryLengthMetric: "duration",
      primaryIntensityMetric: "percentOfFtp",
      primaryIntensityTargetOrRange: "range",
    };
    assert.equal(computeStructureMetrics(structure), null);
  });
});
