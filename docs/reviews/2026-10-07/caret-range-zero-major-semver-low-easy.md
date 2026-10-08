# `^` range semantics diverge from npm semver for `0.x` majors

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/compatibility.ts`
- **Lines:** 78-80

## Description

`satisfies` implements `^x.y.z` as "same major, >= floor". Under real semver (npm/node-semver),
caret ranges on a `0.x` major pin the minor: `^0.1.2` means `>=0.1.2 <0.2.0`, because `0.x`
minors are allowed to break. Here `^0.1.2` would accept host api `0.9.0` — exactly the
breaking-change scenario caret on 0.x is meant to exclude.

Today this is latent: `HOST_API_VERSION` is `"1.0.0"` (hostCompatibility.ts:15), so no
real manifest exercises a `0.x` boundary. But the grammar is documented as semver-style
(`apiVersion` described as a "Semver range" in manifest.ts:41), so an author familiar with
npm will read `^0.x` semantics into it that this implementation does not provide.

## Recommendation

Either implement the npm rule (`^0.y.z` ⇒ same major *and* minor when major is 0, plus
`^0.0.z` pins patch), or document the deliberate divergence in the `satisfies` docstring.
A one-line code change covers the common case:

```ts
if (operator === "^") {
  const sameUpper = floor.major === 0 ? version.minor === floor.minor : true;
  return version.major === floor.major && sameUpper && atLeast(version, floor);
}
```

## Verification

Read compatibility.ts:70-85 and hostCompatibility.ts:15 (`"1.0.0"`). Compared against
node-semver caret rules for 0.x majors. No test covers `^0.x` (compatibility.test.ts
only exercises `^1.x`, `^2.x`, `^9.x`, `~`, exact, `*`).
