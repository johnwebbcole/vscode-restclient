# Sync AI Skills Across All Engines

Use this skill whenever any AI instruction file is created or updated.
It ensures every AI engine always has the same workflows and rules regardless of which model is running.

---

## Why This Exists

This project defines development workflows (feature TDD, commit messages, docs updates, module refactoring)
in multiple formats for different AI engines:

| Engine | Config File(s) |
|--------|---------------|
| Claude | `.claude/commands/*.md` |
| GitHub Copilot (all models) | `.github/copilot-instructions.md` |

When you add or change a workflow in one file, all others must be updated to match.

---

## Step 1 — Identify What Changed

If the user says which file was changed, use that.
Otherwise run `git diff --name-only HEAD` or `git status` to find recently modified AI config files.

Read the changed file in full to understand what was added, removed, or modified.

Ask: *"Is there anything else that changed that I should include in this sync?"*

---

## Step 2 — Audit All Config Files

Read every file in the table above.
For each file, note:
- Which workflows/rules are present
- Which are missing compared to the source of truth (the file that changed)
- Which have outdated versions of a workflow

Produce a brief gap report:
```
Missing in .github/copilot-instructions.md: "Refactor Large TypeScript Modules" workflow
Up to date: .claude/commands/refactor-modules.md
```

Ask: *"Does this gap report look right before I start updating files?"*

---

## Step 3 — Propagate Changes

Update each file that needs it.
Preserve the native format for each engine:

### Claude (`.claude/commands/<skill>.md`)
- One file per skill, named after the command (e.g. `refactor-modules.md` → `/refactor-modules`)
- Pure markdown, no frontmatter
- Imperative instructions addressed to the AI

### GitHub Copilot (`.github/copilot-instructions.md`)
- **This file applies to ALL Copilot AI models** (GPT-4o, Claude, o1, Gemini, etc.)
- Append a new `## Workflow: <Name>` section
- Use "When the user asks..." framing
- Keep steps numbered and concise

---

## Step 4 — Verify Consistency

After updating all files, confirm:
- Every workflow that exists in Claude skills exists in all other engines
- Content is equivalent (same steps, same logic) even if format differs
- No engine has a stale or incomplete version

List all files updated and what was changed in each.

---

## Step 5 — Propose a Commit

Present a commit using the standard format:
```
chore(ai-skills): sync <workflow name> to all AI engine configs

<Why: brief explanation of what was added/changed and why consistency matters>

Updated: list all files changed
```

Draft BlueSky and LinkedIn posts if the change added a meaningful new workflow.

**When drafting posts,** append to `/chat/bluesky-posts.md` and `/chat/linkedin-posts.md`.
Each entry: timestamp (ISO 8601) · summary · post · links · hashtags · "To Add" section. Append newest last.

Ask: *"Ready to commit?"* Only commit on confirmation.

---

## Post File Format

```markdown
## [ISO 8601 timestamp] - [One-line summary]

**Post:** [content]
**Links:** [Repo](https://github.com/johnwebbcole/vscode-restclient) | [Marketplace](https://marketplace.visualstudio.com/items?itemName=JohnCole.restclient-mcp)
**Hashtags:** #OpenSource #VSCode [topic tags]
**To Add:** [screenshots, examples, or media needed]
```
