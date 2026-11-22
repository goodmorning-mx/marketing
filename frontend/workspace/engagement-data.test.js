const assert = require("node:assert/strict");
const test = require("node:test");
const data = require("./engagement-data.js");

test("weekly Overall is the sum of all recorded platform series", () => {
  const result = data.snapshot(data.ranges.weekly, "overall");
  assert.deepEqual(result.platformTotals, {
    facebook: { value: 311, observedCount: 7, expectedCount: 7, missingCount: 0 },
    instagram: { value: 406, observedCount: 7, expectedCount: 7, missingCount: 0 },
    whatsapp: { value: 253, observedCount: 7, expectedCount: 7, missingCount: 0 },
  });
  assert.equal(result.total.value, 970);
  assert.equal(result.total.observedCount, 21);
  assert.deepEqual(result.values, [90, 113, 100, 146, 133, 181, 207]);
});

test("period and platform scope use the same source values", () => {
  const weeklyFacebook = data.snapshot(data.ranges.weekly, "facebook");
  const monthlyOverall = data.snapshot(data.ranges.monthly, "overall");
  assert.equal(weeklyFacebook.total.value, 311);
  assert.deepEqual(weeklyFacebook.values, data.ranges.weekly.values.facebook);
  assert.equal(monthlyOverall.total.value, 532);
  assert.deepEqual(monthlyOverall.values, [77, 109, 150, 196]);
});

test("a measured zero remains different from missing data", () => {
  assert.deepEqual(data.aggregate([0, null]), {
    value: 0,
    observedCount: 1,
    expectedCount: 2,
    missingCount: 1,
  });
  assert.deepEqual(data.aggregate([null, undefined]), {
    value: null,
    observedCount: 0,
    expectedCount: 2,
    missingCount: 2,
  });
  assert.equal(data.formatValue(0, "en-US"), "0");
  assert.equal(data.formatValue(null, "en-US"), "No data");
  assert.equal(data.formatValue(0, "es-MX"), "0");
  assert.equal(data.formatValue(null, "es-MX"), "Sin datos");
});

test("Overall includes available records and excludes missing points", () => {
  const partialRange = {
    values: {
      facebook: [0, null],
      instagram: [null, null],
      whatsapp: [null, 5],
    },
    labels: [["Day 1", "Day 2"], ["Día 1", "Día 2"]],
    period: ["test period", "periodo de prueba"],
  };
  const result = data.snapshot(partialRange, "overall");
  assert.equal(result.total.value, 5);
  assert.equal(result.total.observedCount, 2);
  assert.equal(result.total.expectedCount, 6);
  assert.equal(result.total.missingCount, 4);
  assert.deepEqual(result.values, [0, 5]);
  assert.equal(result.platformTotals.facebook.value, 0);
  assert.equal(result.platformTotals.instagram.value, null);
});
