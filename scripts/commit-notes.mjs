// Turn conventional-commit subjects into a user-facing release-notes draft
// for CHANGELOG.mobile.md. Pure helpers over an array of subject lines so
// they can be unit-tested without git; bump-version.mjs feeds them the
// output of `git log --format=%s` since the previous release.

const SECTIONS = [
  { types: ["feat"], heading: "New" },
  { types: ["fix"], heading: "Fixed" },
  { types: ["style", "copy", "perf", "refactor"], heading: "Polish" },
];

// Merges, release chores, and non-user-facing prefixes never belong in the
// notes; "review round N" subjects are PR-nit fixes whose substance the
// reviewed commit's own bullet already covers.
const SKIP =
  /^(merge( |$)|chore(\(|:)|docs(\(|:)|test(\(|:))|review round \d/i;

export function cleanSubject(subject) {
  const body = subject.match(/^[a-z]+(\([^)]*\))?:\s*(.+)/i)?.[2] ?? subject;
  const cased = body.charAt(0).toUpperCase() + body.slice(1);
  return cased.replace(/\.$/, "");
}

export function draftFromSubjects(subjects) {
  const parts = [];
  for (const { types, heading } of SECTIONS) {
    const bullets = subjects
      .filter((s) => !SKIP.test(s))
      .filter((s) =>
        types.includes((s.match(/^([a-z]+)/i)?.[1] ?? "").toLowerCase()),
      )
      .map(cleanSubject);
    if (bullets.length > 0) {
      parts.push(
        `### ${heading}\n\n${bullets.map((b) => `- ${b}`).join("\n")}`,
      );
    }
  }
  return parts.join("\n\n");
}
