# Humanize — Edit AI-Generated Writing

Edit an AI-generated draft article or post to sound like it was written by a person, not a model.
The goal is a draft worth publishing — not a polished-by-AI version that still sounds like a press release.

---

## Step 1 — Interview first

Before editing, ask the user these questions in one message and wait for their answers.
**Do not make up answers. Do not invent anecdotes, details, or examples, unless they are from the code, commit messages, or documentation.**

1. What is the one thing you most want a reader to take away from this piece?
2. Is there a specific moment, frustration, or event that prompted you to write about this topic?
3. Is there anything in the draft that isn't accurate or that you'd remove?
4. Do you have a real example or anecdote that illustrates the main point? (Describe it briefly.)
5. What's your natural writing voice like — matter-of-fact, a little dry, enthusiastic, something else?
6. Is there anything in the draft you actually like and want to keep?

If the user skips a question, don't fill it in. Work with what you have.

---

## Step 2 — Audit the draft

Read the full draft and flag:

- **Fabricated facts**: anything that sounds vivid and specific but wasn't confirmed by the user. Remove or ask about it. Never keep invented details.
- **AI tells**: "notably," "crucially," "in conclusion," "it's worth noting," "game-changer," "transformative," "delve," "leverage," "at the end of the day," "in today's world." Cut them.
- **Corporate-speak constructions**: "I was able to," "This allowed me to," "It is important to note." Replace with direct statements.
- **Identical sentence lengths**: look for stretches of sentences that all run the same length. Break them up.
- **Passive voice clusters**: "was done," "was built," "was found." Rewrite as active.
- **Overly tidy structure**: AI tends to make everything parallel and balanced. Real writing has rougher edges.

List what you found before editing. Let the user confirm or redirect.

---

## Step 3 — Edit with these constraints

**Voice:**
- Use contractions: it's, don't, I've, you'll, wasn't.
- Short sentences are fine. So are long ones, when the idea earns it.
- Let a paragraph end on something small if the idea is small. Not every paragraph needs a punchline.
- One casual aside per section is enough. Don't perform personality.

**Structure:**
- Keep sections short. If a section runs more than 4–5 paragraphs, consider splitting or cutting.
- Headers should describe what's in the section, not announce it ("The Fix" not "How I Fixed the Problem").
- The opening sentence should make someone want to read the second sentence. That's all it needs to do.

**Facts:**
- Only include details the user confirmed. If a detail sounds good but wasn't in the interview, cut it or ask.
- If you want to add a specific example that isn't in the draft, say: "I'd like to add an example here — can you tell me about [specific thing]?" Then wait.

---

## Step 4 — Show the edit

Present the revised version. Call out the 3–4 most significant changes you made and why.

Then ask:
- "Does this sound like you?"
- "Anything that feels off or that you'd say differently?"

Make a second pass if needed. Repeat until the user confirms it's ready.

---

## Step 5 — Final check

Before signing off, verify:
- No fabricated facts remain.
- No AI-tell phrases remain.
- The first sentence of the article would make you keep reading.
- The last sentence of the article doesn't try to summarize everything that came before it.
