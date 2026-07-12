import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGoogleMapsEmbedUrl,
  shouldExposeTrackPoint,
} from "../trackPrivacy";

describe("trackPrivacy contract", () => {
  it("never exposes a point when not trackable", () => {
    assert.equal(
      shouldExposeTrackPoint(false, { lat: -33.9, lng: 18.4, created_at: null }),
      null,
    );
  });

  it("exposes a valid point when trackable", () => {
    assert.deepEqual(shouldExposeTrackPoint(true, { lat: -33.9, lng: 18.4, created_at: "t" }), {
      lat: -33.9,
      lng: 18.4,
      created_at: "t",
    });
  });

  it("rejects invalid coordinates even when trackable", () => {
    assert.equal(shouldExposeTrackPoint(true, { lat: 999, lng: 18, created_at: null }), null);
    assert.equal(shouldExposeTrackPoint(true, null), null);
  });

  it("builds an embed URL without leaking when coords are clamped", () => {
    const url = buildGoogleMapsEmbedUrl(-33.9249, 18.4241);
    assert.match(url, /google\.com\/maps/);
    assert.match(url, /output=embed/);
    assert.match(url, /-33\.9249/);
  });
});
