# TrainingPeaks MCP Server — Internal API Reference

> See [README.md](README.md) for user-facing documentation: setup, authentication, usage examples, and tool reference.
>
> This file documents the TrainingPeaks API internals needed for development — endpoint contracts, wire formats, and implementation quirks.

## Authentication

Cookie-to-token flow (see README for how to obtain the cookie):

```
GET https://tpapi.trainingpeaks.com/users/v3/token
Cookie: Production_tpAuth=<cookie_value>
→ { "token": { "access_token": "...", "expires_in": 3600 }, "athleteId": 12345 }
```

Bearer token expires in **1 hour**; refresh proactively ~60s before expiry.

## Base URLs

```
https://tpapi.trainingpeaks.com       — main API (workouts, fitness, events, settings, etc.)
https://api.peakswaresb.com           — strength workouts + weather settings (same Bearer token)
```

All API calls use `Authorization: Bearer <access_token>` header.

---

### Key Endpoints

#### User / Identity

```
GET /users/v3/user
```

Returns user profile. Important fields: `user.userId` (integer, use as athlete ID in all other calls), `user.firstName`, `user.lastName`, `user.settings.account.isPremium`.

#### Workout Types

```
GET /fitness/v6/workouttypes
```

Returns the full catalogue of primary types and their sub-types. No auth scoping — not athlete-specific.

Complete type list (confirmed from network capture):

```
1   → Swim        subtypes: Open Water Swim (1), Pool Swim (2)
2   → Bike        subtypes: Road Bike (3), Gravel Bike (4), Track Bike (5), Indoor Bike (6),
                            Cyclocross (7), E-Bike (8), Hand Cycling (9), Time Trial (47), Virtual Bike (49)
3   → Run         subtypes: Road Run (10), Track Run (11), Trail Run (12), Indoor Run (13), Virtual Run (50)
4   → Brick       (no subtypes)
5   → Crosstrain  (no subtypes)
6   → Race        (no subtypes)
7   → Day Off     (no subtypes)
8   → Mountain Bike  subtypes: XC-MTB (14), Enduro MTB (15), Downhill MTB (16), Short Track MTB (17),
                               Fat Bike MTB (18), E-MTB (19)
9   → Strength    (legacy, no subtypes)
10  → Custom      (no subtypes)
11  → XC-Ski      subtypes: Classic Ski (26), Skate Ski (27), Alpine Ski (28), Ski Touring (29),
                            Ski Mountaineering (30), Biathlon Ski (31), Roller Skiing (32),
                            Nordic Combined Ski (33), Split Boarding (34), Cross Country Ski (46)
12  → Rowing      subtypes: Indoor Rowing (39), Virtual Rowing (51)
13  → Walk        subtypes: Hike (41), Treadmill Walk (42), Mountaineering (43), Hunting (44)
29  → Strength+   subtypes: Mobility (20), Functional Fitness (21), Yoga (22), Rock Climbing (23),
                            Hybrid Strength (24), Stretching (25)
100 → Other       subtypes: Speed Skating (45), Equestrian (48), Kayak (38), Sailing (37),
                            Canoe (35), SUP (36), Surfing (40)
```

The workout payload uses `workoutTypeValueId` for the primary type and `workoutSubTypeValueId` for the optional sub-type.

#### Workouts — Read

```
GET /fitness/v6/athletes/{athleteId}/workouts/{startDate}/{endDate}
```

- Date format: `YYYY-MM-DD`
- Max range: 90 days
- Returns array of workout summaries

Key workout fields:

```
workoutId              - unique ID
workoutDay             - date (ISO)
title                  - workout title
workoutTypeValueId     - primary sport type ID (see enum above)
workoutSubTypeValueId  - optional sub-type ID
workoutTypeFamilyId    - sport family
totalTimePlanned       - planned duration (HOURS as float)
totalTime              - actual duration (HOURS as float)
tssPlanned             - planned TSS (int)
tssActual              - actual TSS (int)
description            - workout description
coachComments          - coach notes
athleteComments        - athlete notes/rating
feeling                - athlete feel rating (0–10)
rpe                    - rate of perceived exertion (1–10)
completed              - bool
distancePlanned        - planned distance (meters)
distance               - actual distance (meters)
powerAverage           - avg power (watts)
normalizedPowerActual  - NP (watts)
heartRateAverage       - avg HR (bpm)
cadenceAverage         - avg cadence (rpm)
elevationGain          - elevation gain (m)
calories               - calories burned
ifPlanned / if         - Intensity Factor
userTags               - string[] of tags
```

#### Single Workout Detail

```
GET /fitness/v6/athletes/{athleteId}/workouts/{workoutId}
```

Same fields as list, plus the full `structure` field (JSON string of interval structure).

#### Create Workout

```
POST /fitness/v6/athletes/{athleteId}/workouts
Content-Type: application/json

{
  "athleteId": "12345",
  "workoutDay": "2024-03-15",
  "workoutTypeValueId": 2,
  "workoutSubTypeValueId": 3,   // optional sub-type
  "title": "Threshold Intervals",
  "description": "4x10min at threshold",
  "coachComments": "",
  "athleteComments": "",
  "totalTimePlanned": 1.5,      // HOURS as float
  "distancePlanned": 40000,     // meters
  "tssPlanned": 120,
  "userTags": ["key", "threshold"],
  "structure": "..."            // double-serialized JSON string
}
```

**Important:** The POST endpoint requires all fields to be present (even as null), `athleteId` as a number (not string), `userTags` as a comma-separated string (not array), and `workoutId: 0` for new workouts. Omitting fields or using wrong types causes 400 "No workout sent".

#### Update Workout

```
PUT /fitness/v6/athletes/{athleteId}/workouts/{workoutId}
Content-Type: application/json
(full workout object — partial updates are rejected)
```

Implementation: GET the existing workout, merge updates, then PUT the complete object.

#### Delete Workout

```
DELETE /fitness/v6/athletes/{athleteId}/workouts/{workoutId}
Returns: boolean
```

#### Workout Comments

```
GET    /fitness/v2/athletes/{athleteId}/workouts/{workoutId}/comments
POST   /fitness/v2/athletes/{athleteId}/workouts/{workoutId}/comments
DELETE /fitness/v2/athletes/{athleteId}/workouts/{workoutId}/comments/{commentId}
```

POST body: `{ "value": "comment text" }`. Both POST and GET return `WorkoutComment[]`.
Comment fields: `id`, `comment`, `dateCreated`, `workoutId`, `commenterPersonId`, `commenterName`, `isCoach`.

#### Private Workout Notes

```
PUT /fitness/v6/workouts/{workoutId}/privateWorkoutNote
```

Body: `{ "note": "text" }`. Returns empty body (200). Note: no `athleteId` in the path.

#### Fitness Metrics (CTL/ATL/TSB)

```
POST /fitness/v1/athletes/{athleteId}/reporting/performancedata/{startDate}/{endDate}
Content-Type: application/json

{
  "atlConstant": 7,
  "atlStart": 0,
  "ctlConstant": 42,
  "ctlStart": 0,
  "workoutTypes": []
}
```

Returns array of daily records: `{ workoutDay, tssActual, ctl, atl, tsb }`

- CTL = Chronic Training Load (fitness, ~42-day average)
- ATL = Acute Training Load (fatigue, ~7-day average)
- TSB = Training Stress Balance (form = CTL - ATL)

#### Annual Training Plan (ATP)

```
GET /fitness/v1/athletes/{athleteId}/atp/{startDate}/{endDate}
```

Returns weekly training plan entries. Key fields:

```
week                   - ISO datetime (start of week)
atpType                - "TSS"
volume                 - planned weekly TSS
period                 - training period name (e.g. "Base 1 - Week 2", "Race")
raceName               - race name if any that week
racePriority           - "A", "B", "C", or ""
limitingFactors        - { "1": [...], "2": [...], "3": [...] } keyed by sport
weeksToNextPriorityEvent
```

#### Personal Records / Peaks

```
GET /personalrecord/v2/athletes/{athleteId}/workouts/{workoutId}?displayPeaksForBasic=true
```

Returns PRs set during a specific workout.

```
GET /personalrecord/v2/athletes/{athleteId}/{sport}?prType={metric}&startDate=...&endDate=...
```

- `sport`: `Bike` or `Run`
- `prType` for cycling: `power5sec`, `power1min`, `power5min`, `power10min`, `power20min`, `power60min`, `power90min`
- `prType` for running: `speed400Meter`, `speed800Meter`, `speed1K`, `speed1Mi`, `speed5K`, `speed10K`, `speedHalfMarathon`, `speedMarathon`

Returns: `[{ rank, value, workoutId, workoutTitle, workoutDate }]`

#### Athlete Settings & Training Zones

```
GET /fitness/v1/athletes/{athleteId}/settings
```

Returns `heartRateZones`, `powerZones`, `speedZones` arrays plus basic athlete info.

**PUT endpoints (each requires the full zone-set array):**

```
PUT /fitness/v2/athletes/{athleteId}/powerzones      — body: PowerZoneSet[]
PUT /fitness/v2/athletes/{athleteId}/heartratezones  — body: HeartRateZoneSet[]
PUT /fitness/v2/athletes/{athleteId}/speedzones      — body: SpeedZoneSet[]
POST /fitness/v1/athletes/{athleteId}/nutritionsettings — body: { athleteId, plannedCalories, substrateUtilizationCategory }
PUT /fitness/v1/athletes/{athleteId}/equipment       — body: Equipment[] (full array; GET first, modify item, PUT back)
```

Zone PUT bodies require `currentUserId` = athleteId in each zone set object.
Power zones use Coggan 5-zone model: 0–55 / 56–75 / 76–90 / 91–105 / 106%+ FTP.
HR and speed zones use proportional scaling (new_threshold / old_threshold × all zone boundaries).
Speed thresholds are in **m/s** internally (run: 1000/pace_seconds, swim: 100/pace_seconds).
Sentinel max values: power = 2000 W, run/swim = 10 × threshold.

#### Pool Length Settings

```
GET /fitness/v1/athletes/{athleteId}/poollengthsettings
```

Response:

```json
{
  "options": [
    { "id": "DEFAULT-50M", "length": 50.0, "units": "Meters", "label": "50 Meters pool" },
    { "id": "DEFAULT-25Y", "length": 25.0, "units": "Yards", "label": null },
    { "id": "<uuid>", "length": 50.0, "units": "Yards", "label": "Custom Pool Name" }
  ],
  "defaultId": "DEFAULT-50M",
  "supportedUnits": ["Yards", "Meters"]
}
```

IDs are either `DEFAULT-*` strings or UUIDs for custom pools. The `poolLengthOptionId` in swim workout payloads references these IDs.

#### Equipment

```
GET /fitness/v1/athletes/{athleteId}/equipment
```

Returns `Equipment[]`. Fields include `equipmentId`, `type` (1=Bike, 2=Shoe), `name`, `retired`, `actualDistance` (metres), `maxDistance` (metres; null = no limit), `startingDistance`.

#### Events / Calendar Events

```
GET  /fitness/v6/athletes/{athleteId}/events/focusevent
GET  /fitness/v6/athletes/{athleteId}/events/{startDate}/{endDate}
POST /fitness/v6/athletes/{athleteId}/events
PUT  /fitness/v6/athletes/{athleteId}/event              — update (singular! ID in body, full object required)
DELETE /fitness/v6/athletes/{athleteId}/events/{eventId}
```

Returns `FocusEvent` / `FocusEvent[]`. Key fields: `id`, `name`, `eventDate`, `eventType`, `atpPriority` (A/B/C), `goals`, `results`, `raceTypeDuration`, `ctlTarget`, `workoutIds`. Hidden events have `isHidden: true`.

#### Calendar Notes

```
POST   /fitness/v1/athletes/{athleteId}/calendarNote          — create
GET    /fitness/v1/athletes/{athleteId}/calendarNote/{id}     — get single
PUT    /fitness/v1/athletes/{athleteId}/calendarNote/{id}     — update (requires full body incl. createdDate)
DELETE /fitness/v1/athletes/{athleteId}/calendarNote/{id}     — delete
PUT    /fitness/v1/athletes/{athleteId}/calendarNote/{id}/comment    — add/update comment
GET    /fitness/v1/athletes/{athleteId}/calendarNote/{id}/comments   — list comments
```

Create body: `{ athleteId, title, noteDate, description, isHidden, attachments: [] }`
Comment add: `{ Comment: "..." }`. Comment update: `{ Comment: "...", CalendarNoteCommentStreamId: <id> }`.

#### Availability

```
POST   /fitness/v1/athletes/{athleteId}/availability                 — create
DELETE /fitness/v1/athletes/{athleteId}/availability/{id}            — delete
GET    /fitness/v1/athletes/{athleteId}/availability/{start}/{end}   — list
```

Body: `{ athleteId, startDate, endDate, type, limitedAvailability, reason, availableSportTypes, description }`

- `type: 1` = Unavailable, `type: 2` = Limited availability (with `availableSportTypes` populated)
- `limitedAvailability` is **always `false`** in API responses — `type` field is the real discriminator

#### Goal Lists

```
POST   /fitness/v1/athletes/{athleteId}/goallists     — create
DELETE /fitness/v1/athletes/{athleteId}/goallists/{id} — delete (returns 204)
```

Body includes `goals[]` array with Written-type goal items and `isFuture`/`isToday`/`isPast` computed client-side from `activityDate`.

#### Health Metrics

```
POST /metrics/v3/athletes/{athleteId}/consolidatedtimedmetric    — log metrics (singular URL)
GET  /metrics/v3/athletes/{athleteId}/consolidatedtimedmetrics/{start}/{end}  — read metrics (plural URL)
```

Confirmed metric type IDs:

```
5   → Pulse (bpm)             min: 10, max: 200
6   → Sleep (hours)           min: 0, max: 72
9   → Weight (kg)             min: 0, max: 1000
15  → RMR (kcal)              min: 500, max: 5000
23  → Injury/Health (enum 1–10)
53  → SPO2 (%)                min: 0, max: 100
58  → Steps                   min: 0, max: 1,000,000,000
60  → HRV                     min: 0, max: 200
```

Injury enumeration: 1=Extremely Injured … 8=Healthy … 10=Extremely Healthy

POST body: `{ athleteId, timeStamp: "YYYY-MM-DDT00:00:00", id: null, details: MetricDetail[] }`
Each `MetricDetail`: `{ type, label, value, time: "YYYY-MM-DDT12:00:00", temporaryId: 0, units, formatedUnits, min, max }` (numeric) or `{ ..., enumeration: [{value, label}] }` (enum). Note: `formatedUnits` is TP's spelling (not a typo).

#### Nutrition

```
GET /fitness/v1/athletes/{athleteId}/nutrition/{startDate}/{endDate}
```

Returns array (may be empty `[]`). Data sourced from connected apps like MyFitnessPal. Format TBD — response body was empty in captures.

#### Exercise Libraries (cardio workout templates)

```
GET    /exerciselibrary/v2/libraries                   — list libraries
GET    /exerciselibrary/v2/libraries/{id}/items        — list items in library
POST   /exerciselibrary/v1/libraries                   — create folder { libraryName }
PUT    /exerciselibrary/v1/libraries/{id}/name          — rename folder { value: "name" }
POST   /exerciselibrary/v1/libraries/{id}/items        — create item
PUT    /exerciselibrary/v1/libraries/{id}/items/{itemId} — update/move item (full object; set exerciseLibraryId to move)
DELETE /exerciselibrary/v1/libraries/{id}/items/{itemId} — delete item (204)
DELETE /exerciselibrary/v1/libraries/{id}               — delete folder
POST   /fitness/v6/athletes/{id}/commands/addworkoutfromlibraryitem — schedule template onto calendar
```

Schedule body: `{ athleteId, exerciseLibraryItemId, workoutDateTime: "YYYY-MM-DD" }`. The server computes duration, TSS, IF, energy, and structure from the template — no client-side computation needed.

**Key difference from workout calendar**: library item `structure` is a plain nested object (not double-serialized).

---

## Workout Structure Format

The `structure` field in workout create/update is a **double-serialized JSON string** — confirmed from Safari devtools capture. The field value is a JSON string; axios then encodes it again so it appears as a quoted+escaped string in the HTTP body.

The object shape (confirmed against real browser request):

```json
{
  "structure": [
    {
      "type": "step",
      "length": { "value": 1, "unit": "repetition" },
      "steps": [
        {
          "name": "Warm up",
          "length": { "value": 1200, "unit": "second" },
          "targets": [{ "minValue": 40, "maxValue": 50 }],
          "intensityClass": "warmUp",
          "openDuration": false
        }
      ],
      "begin": 0,
      "end": 1200
    },
    {
      "type": "repetition",
      "length": { "value": 4, "unit": "repetition" },
      "steps": [
        {
          "type": "step",
          "name": "Hard",
          "length": { "unit": "second", "value": 360 },
          "targets": [{ "minValue": 85, "maxValue": 95 }],
          "intensityClass": "active",
          "openDuration": false
        },
        {
          "type": "step",
          "name": "Easy",
          "length": { "unit": "second", "value": 180 },
          "targets": [{ "minValue": 50, "maxValue": 60 }],
          "intensityClass": "rest",
          "openDuration": false
        }
      ],
      "begin": 1200,
      "end": 3360
    },
    {
      "type": "step",
      "length": { "value": 1, "unit": "repetition" },
      "steps": [
        {
          "name": "Cool down",
          "length": { "value": 600, "unit": "second" },
          "targets": [{ "minValue": 40, "maxValue": 50 }],
          "intensityClass": "coolDown",
          "openDuration": false
        }
      ],
      "begin": 3360,
      "end": 3960
    }
  ],
  "primaryLengthMetric": "duration",
  "primaryIntensityMetric": "percentOfFtp",
  "primaryIntensityTargetOrRange": "range",
  "visualizationDistanceUnit": null
}
```

**Key structural rules:**

- Top-level blocks have `begin`/`end` (cumulative seconds)
- `intensityClass` required on every step: `"warmUp"`, `"active"`, `"rest"`, `"coolDown"`, `"recovery"`, `"other"`
- `openDuration: false` required on every step
- Inner steps of `repetition` blocks get `"type": "step"` — inner steps of `step` blocks do NOT
- `targets` entries for primary intensity have **no `unit` field** (just `{ minValue, maxValue }`)
- Cadence targets do include `"unit": "roundOrStridePerMinute"`
- Root includes `"primaryIntensityTargetOrRange": "range"`

**Step types:**

- `"step"` — single interval (always `length: { value: 1, unit: "repetition" }`)
- `"repetition"` — repeated block; outer `length.value` = rep count
- `"rampUp"` / `"rampDown"` — ramp intervals (not yet implemented in builder)

**Intensity metrics (primaryIntensityMetric):**

- `"percentOfFtp"` — cycling (targets are % of FTP)
- `"percentOfThresholdHr"` — HR-based (% of threshold HR)
- `"percentOfThresholdPace"` — running pace-based

---

## Structured Strength Workouts

### Base URL

```
https://api.peakswaresb.com
```

A **separate** service from `tpapi.trainingpeaks.com`. Uses the **same Bearer token**. CORS-enabled, all responses wrapped in `{ data: ..., errors: {} }`.

### Workflow

**MCP shortcut**: Build the complete workout object locally (with `crypto.randomUUID()` IDs) and POST directly to `/rx/activity/v1/workouts/save`. The server assigns permanent numeric string IDs after save (e.g. UUID `"3819d22c-..."` → integer `"17077718"`).

```
POST /rx/activity/v1/workouts/save        — create/save workout
GET  /rx/activity/v1/workouts/{id}/summary — get summary with compliance, RPE, per-exercise totals
```

### Block types

`"SingleExercise"`, `"WarmUp"`, `"Superset"`, `"Circuit"`, `"CoolDown"`

### Known parameter names

| Parameter              | inputFormat | Notes                                               |
| ---------------------- | ----------- | --------------------------------------------------- |
| `Reps`                 | Integer     |                                                     |
| `RepsPerSide`          | Integer     |                                                     |
| `WeightKg`             | Decimal     |                                                     |
| `WeightLb`             | Decimal     |                                                     |
| `WeightPerSideKg`      | Decimal     |                                                     |
| `WeightPerSideLb`      | Decimal     |                                                     |
| `WeightPercentage`     | Decimal     |                                                     |
| `Duration`             | Integer     | actual API param name (not DurationSeconds/Minutes) |
| `DistanceMeters`       | Integer     |                                                     |
| `DistanceKm`           | Decimal     |                                                     |
| `DistanceFt`           | Integer     |                                                     |
| `DistanceYd`           | Integer     |                                                     |
| `DistanceMiles`        | Decimal     |                                                     |
| `HeightCm`             | Integer     |                                                     |
| `HeightM`              | Decimal     |                                                     |
| `HeightIn`             | Decimal     |                                                     |
| `HeightFt`             | Decimal     |                                                     |
| `RPE`                  | Integer     |                                                     |
| `Cals`                 | Integer     |                                                     |
| `Watts`                | Integer     |                                                     |
| `VelocityMetersPerSec` | Decimal     |                                                     |

### Key rules

- **Exercise IDs**: must be valid TP library IDs (numeric strings like `"5178"`, `"400"`)
- **Prescription parameters**: have UUID `id`s (generated client-side)
- **`inputFormat`**: `"Integer"` for Reps/RepsPerSide/Duration/RPE/Cals; `"Decimal"` for Weight/Distance params
- **`calendarId`**: assumed equal to `athleteId`

### Weather Settings (also on api.peakswaresb.com)

```
GET /weather/v1/settings
```

Response: `[{ athleteId, enabled, location, lat, lon }]` (array, first element used). `enabled`: 1=on, 0=off.

---

## Implementation Notes

### Duration Units

**IMPORTANT**: `totalTimePlanned` and `totalTime` are in **HOURS** (e.g., 1.5 = 90 minutes), NOT seconds or minutes.

### Structure Serialization

```typescript
const requestBody = {
  ...workoutData,
  structure: JSON.stringify(structureObject), // string value; axios re-encodes as JSON string
};
```

### Token Caching

Cached with 60s pre-expiry refresh. Athlete ID fetched once from `/users/v3/user` and cached for the session.

### Create Workout Payload

The TP API POST endpoint is strict about payload format: all fields must be present (even as null), `athleteId` must be a number (not string), `userTags` must be a comma-separated string (not an array), and `workoutId: 0` must be included for new workouts. Omitting fields or using wrong types causes 400 "No workout sent". `totalTimePlanned` is auto-computed from the structure duration when not explicitly provided.

### Update Workout

`updateWorkout` GETs the full workout first, merges updates, then PUTs the complete object. The TP API requires the full workout payload on PUT (partial updates are rejected).

### intensityClass

The TP API rejects `"recovery"` as an intensityClass value. The structure builder maps `recovery` → `rest` before sending to the API. Use `rest` for all recovery intervals (both within repetition blocks and standalone between sets).

## Development

See [README.md](README.md) for build commands, Claude Desktop setup, and contributing guidelines.
