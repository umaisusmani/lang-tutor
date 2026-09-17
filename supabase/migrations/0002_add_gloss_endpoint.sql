-- 0002_add_gloss_endpoint.sql
--
-- Adds 'gloss' as a valid token_usage.endpoint value for the new per-message
-- word-by-word translation pass (lib/gloss.ts). Same drop-and-recreate pattern
-- as every other taxonomy CHECK in this schema -- see 0001's note on why these
-- are CHECK constraints rather than native enums.

alter table public.token_usage drop constraint token_usage_endpoint_check;

alter table public.token_usage
  add constraint token_usage_endpoint_check
  check (endpoint in ('chat', 'correction', 'gloss'));
