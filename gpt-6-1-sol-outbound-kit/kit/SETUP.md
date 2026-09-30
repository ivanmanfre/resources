# Run the first account

## Codex app

Unzip the download. Open the kit folder as a Codex project. Select GPT-6.1 Sol from the model picker if your account offers it. Check the selected model before the first run; the files cannot change it themselves.

Fill in context/agency-offer.md, context/prospects.csv and context/source-notes.md. Start with one account. Ask Codex to read AGENTS.md and run the account-research playbook using those files.

For practice, use examples/practice-input.md and ask for a fit check, then message drafts. The case is fictional. All of its source excerpts are inside the file, so you can compare the output with examples/expected-output.md without browsing.

## Codex CLI

If you already use the CLI, open a terminal in the unzipped folder and run:

```sh
codex --model gpt-6.1-sol
```

Then enter:

```text
Read AGENTS.md. Run account research on context/source-notes.md using context/agency-offer.md. Save the result to outputs/account-brief.md.
```

The CLI command selects the model. AGENTS.md supplies this kit's working instructions. Use your current Codex login; the kit contains no credentials or extra software to install.

## Copy a prompt

Open the resource page. Pick a task, paste your agency offer and the relevant facts, then copy the assembled prompt into your GPT-6.1 Sol session. Source excerpts, campaign counts and replies belong in the second input field.

A session with browsing can inspect the public URLs you provide. If browsing is unavailable, paste the page excerpts with source labels and dates. The research playbook will state that it worked from supplied excerpts.

## Check the output

Open each citation and confirm the quoted fact. Check names, offer details and the question in the draft. Add missing evidence to the source notes and rerun the relevant task. The examples show the format; your own inputs determine the result.

Official model documentation: https://developers.openai.com/api/docs/models/gpt-6.1-sol.
Codex skills and instruction guidance: https://learn.chatgpt.com/docs/build-skills.
