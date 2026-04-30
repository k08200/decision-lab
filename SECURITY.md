# Security Policy

Decision Lab is designed to keep the framework public and real decision data private.

## Do Not Commit

- Real investment decisions
- Company strategy or management decisions
- Financial models, runway plans, pricing notes, or customer notes
- Raw research, transcripts, PDFs, spreadsheets, or private source material
- API keys, `.env` files, model responses containing private context, or exported reports from private records

Use the public repository for code, schemas, prompts, docs, and sanitized examples only.

## Recommended Setup

Keep this repository public, then keep your actual records in one of these places:

- a separate private repository
- an encrypted local folder
- a local workspace that is never pushed

The default `.gitignore` blocks local `decisions/`, `research/`, `outputs/`, `.decision-lab.json`, and `.env` content so normal use does not leak private material.

## Reporting

If you find a security issue in the framework, open a private advisory or contact the maintainer directly. Do not open a public issue containing secrets or real decision records.
