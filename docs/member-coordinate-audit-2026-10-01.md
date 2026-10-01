# Member Coordinate Audit — October 1, 2026

## Summary

**Total members in directory:** 1,048
**Members with coordinate issues:** 0

All members have valid latitude/longitude coordinates and are visible to BD's radius matching.

## Audit Method

1. Queried BD API (`GET /api/v2/user/get`) with pagination
2. Checked each member's `lat` and `lon` fields for:
   - NULL values
   - Empty strings
   - Zero coordinates (0.00, 0.00)
   - Invalid ranges (lat > 90 or lon > 180)
   - Parse errors

## Results

No issues found. All 1,048 members have valid geographic coordinates.

## Implication for ZIP Cascade

The ZIP Cascade Service can rely on all members being matchable by proximity.
No exclusion logic needed for members with 0,0 coordinates.

---

*Audit performed via BD API with key "Claude for BD"*
