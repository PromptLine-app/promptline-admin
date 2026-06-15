# CLAUDE.md — Promptline

> Project conventions for the agent pipeline. Every subagent loads this file
> automatically. Keep it accurate; the agents treat it as ground truth.

## What this is
Promptline (promptline.app) — a platform that creates **voice agents** for small
and medium businesses. Multi-tenant SaaS: each customer org provisions and runs
its own voice agent(s).

## Stack & platform
> FILL IN the real specifics — slots the agents need:
- **Frontend:** <framework + language>
- **Backend:** <API server / runtime>
- **Database:** <db + ORM>
- **Voice / TTS:** <provider(s) — e.g. ElevenLabs and any alternatives under
  evaluation; note the multi-tenant agent architecture you settled on:
  agent-per-org vs shared agent.>
- **Auth:** <tenant/user auth model>
- **Hosting/CI:** <where it runs, deploy path>

## Multi-tenancy & voice-agent architecture (critical)
- Multi-tenant: isolate every org's data, config, and voice-agent state.
- Document the agent model here so the developer follows it consistently:
  <agent-per-org | shared-agent-with-tenant-context — FILL IN.>
- TTS provider credentials and per-tenant voice config must be scoped per org
  and never cross tenants.

## Conventions
- <FILL IN: folder structure, naming, API style, error format.>
- Provider abstraction: if multiple TTS providers are in play, keep them behind
  a single interface so swapping ElevenLabs ↔ alternative is a config change,
  not a rewrite. <Confirm/adjust.>

## Testing & e2e (developer agent: read this)
- **Unit/integration harness:** <FILL IN.>
- **e2e harness:** <FILL IN; set up on first chunk if absent.>
- Every feature gets e2e: happy path + key edge/error path.
- For voice/TTS, mock the provider in unit tests; reserve real provider calls
  for a small, clearly-marked integration suite to control cost.

## Security focus (security-reviewer agent: read this)
- **Tenant isolation** across org data and voice-agent config (IDOR on org/agent
  ids is the top risk).
- **Provider API keys** (TTS/LLM/telephony) must come from secrets, be scoped
  per tenant where applicable, and never appear in logs or client responses.
- Validate and authorize any endpoint that triggers outbound voice calls or
  provider usage — these cost money and are abuse targets (rate-limit them).
- Webhooks (telephony/provider callbacks): verify signatures before acting.

## Out of scope for the pipeline
- <FILL IN: billing config, infra, provider account settings, etc.>

## Notes / open items
- GEO / AI-discoverability work is product/marketing, not part of this build
  pipeline — keep it out of code chunks unless explicitly scoped.
