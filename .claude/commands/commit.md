---
model: haiku
---

# Commit — Rich Message + Social Post

Create a thoughtful, well-structured commit for staged (or all) changes.

---

## Step 1 — Review what's changing

Run:
- `git status` — see staged and unstaged files
- `git diff` — see unstaged changes
- `git diff --staged` — see what's already staged
- `git log --oneline -5` — understand context and commit style

If there are unstaged changes, ask: "Should I include all changes, only the staged ones, or should we split this into multiple commits?"

---

## Step 2 — Understand the change

Read every modified file before writing anything.
For each changed file, note:
- What was added, removed, or modified
- Why it was likely changed (feature, bug fix, refactor, docs, test, chore)
- Any non-obvious design decisions in the diff

If the purpose of a change isn't clear from the code, ask the user: "What was the intent behind [specific change]?"

---

## Step 3 — Classify the commit type

Pick the most accurate type:
- `feat` — new user-facing feature
- `fix` — bug fix
- `test` — adding or updating tests (no production code changes)
- `docs` — documentation only
- `refactor` — code restructuring with no behavior change
- `chore` — maintenance, dependency updates, tooling
- `perf` — performance improvement
- `style` — formatting, no logic changes

If the change spans multiple types, choose the dominant one and note the rest in the body.

---

## Step 4 — Write the commit message

Use this format:

```
<type>(<scope>): <summary — imperative mood, under 72 chars>

<Why this change was made: 2–4 sentences. Explain the intent, the
problem being solved, or the decision behind the approach. Avoid
restating what the diff already shows.>

<Optional: "Fixes #issue" | "Breaks: <what changed>" | "Note: <anything reviewers should know>">
```

**Good summary examples:**
- `feat(postman): support nested folders on collection import`
- `fix(mcp-server): resolve $dotenv indirection before request send`
- `docs(readme): document the MCP server setup for agent integration`

**Body tone:** Write for a future engineer — including yourself — reading this commit months from now to understand why this change existed.

---

## Step 5 — Social media

Draft posts for each platform. Only draft these for changes a reader outside this repo would care about (new feature, notable fix, interesting design decision) — skip this step entirely for routine `chore`/`style`/internal `refactor` commits.

**BlueSky** (≤300 chars, punchy, conversational — use `#OpenSource #VSCode` plus relevant topic tags, e.g. `#MCP #API #Postman #TypeScript`):
```
[draft post]
```

**LinkedIn post** (2–3 short paragraphs, professional tone, end with a question or CTA):
```
[draft post]
```

**LinkedIn article** — suggest writing one if this commit represents a substantial feature, a meaningful architectural change, or anything useful to the broader VS Code extension / API tooling / AI agent community. Structure: title → problem → insight → what was built → takeaway → CTA. No em-dashes.

---

## Step 6 — Save posts to markdown files

Append BlueSky and LinkedIn posts to `/chat/bluesky-posts.md` and `/chat/linkedin-posts.md` before showing the user, following the `## Entry Template` already at the top of each file.

A full LinkedIn article gets its own file: `/chat/linkedin-article-<slug>.md` (see `/chat/linkedin-article-a-fork-is-a-copy.md` for the expected shape) — don't append articles into `linkedin-posts.md`.

---

## Step 7 — Verify tests pass

Before committing, run `/test` and confirm all stages are green (extension unit, MCP server, extension integration).

**All stages must be green before proceeding.** If any fail:
1. Diagnose and fix the failure.
2. Re-run the affected stage to confirm.
3. Do not commit until every stage is clean.

---

## Step 8 — Confirm and commit

Show the full commit message and both social posts.
Ask: "Ready to commit? Any edits to the message or posts?"

Only commit when the user confirms. Use:
```
git commit -m "$(cat <<'EOF'
<message here>
EOF
)"
```

After committing, show the social posts again so the user can copy them.

---

## Step 9 — Sync skill to other engines

After committing, remind the user to run `/sync-skills` if this commit modifies any file in `.claude/commands/` — the same workflow must be propagated to `.github/copilot-instructions.md`.
