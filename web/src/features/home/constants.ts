/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/**
 * Home page constants
 *
 * Every visible string lives here as an English source string so it can be
 * translated through i18next. Section components must render these through
 * `t(...)` — never hardcode display text inside the components themselves.
 */

/** Brand identity of the landing page. */
export const BRAND = {
  name: 'LUI',
  /** Public site address, also used as the relay base URL shown to users. */
  site: 'https://luiai.cc.cd',
  /** OpenAI-compatible base URL users paste into their client. */
  baseUrl: 'https://luiai.cc.cd/v1',
  /** Short positioning line used in metadata and badges. */
  tagline: 'Unified Model Access',
} as const

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export const HERO_BADGE = 'Unified model access'

export const HERO_TITLE_LEAD = 'One key for'
export const HERO_TITLE_ACCENT = 'every frontier model'

export const HERO_DESCRIPTION =
  'LUI puts GPT, Claude, Gemini, DeepSeek, Qwen and more behind one OpenAI-compatible endpoint. Pay per token and watch every call as it happens.'

export const HERO_BASE_URL_LABEL = 'Base URL'
export const HERO_BASE_URL_HINT =
  'Point your client at this address. Model names and request bodies stay exactly the same.'

export const HERO_CLIENTS_LABEL = 'Works out of the box with'

export const HERO_PRIMARY_CTA = 'Get Started'
export const HERO_SECONDARY_CTA = 'View Pricing'
export const HERO_DOCS_CTA = 'Documentation'
export const HERO_DASHBOARD_CTA = 'Go to Dashboard'

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const HOME_STATS = [
  { end: 120, suffix: '+', decimals: 0, label: 'upstream models' },
  { end: 200, suffix: '+', decimals: 0, label: 'per-model pricing rules' },
  { end: 40, suffix: '+', decimals: 0, label: 'compatible API routes' },
  { end: 99.9, suffix: '%', decimals: 1, label: 'route availability' },
] as const

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export const FEATURES_HEADING_LABEL = 'Why LUI'
export const FEATURES_HEADING_LEAD = 'Every mainstream model,'
export const FEATURES_HEADING_ACCENT = 'one endpoint is enough'

export const HOME_FEATURES = [
  {
    id: 'protocol',
    num: '01',
    title: 'One protocol for every model',
    description:
      'OpenAI, Anthropic and Gemini request shapes are translated in one place. Switch models by changing the model name — nothing else.',
    iconName: 'Code',
    span: 'md:col-span-2',
    accent: 'blue',
  },
  {
    id: 'billing',
    num: '02',
    title: 'Billed per token, in real time',
    description:
      'Input and output tokens are metered on every request and settled instantly. The console shows exactly which call cost what.',
    iconName: 'DollarSign',
    span: 'md:col-span-1',
    accent: 'emerald',
  },
  {
    id: 'failover',
    num: '03',
    title: 'Redundant routes, automatic failover',
    description:
      'The same model is served by several upstreams. Priority, weight and retry rules keep traffic flowing when one line drops.',
    iconName: 'Shield',
    span: 'md:col-span-1',
    accent: 'amber',
  },
  {
    id: 'throughput',
    num: '04',
    title: 'Built for real throughput',
    description:
      'Streaming responses stay open end to end, with concurrency handled by the scheduler instead of hard client-side caps.',
    iconName: 'Gauge',
    span: 'md:col-span-2',
    accent: 'violet',
  },
] as const

export const HOME_FEATURES_EXTRA = [
  {
    title: 'Keys and groups',
    description:
      'Issue scoped API keys per team and bind them to model groups, quotas and expiry dates.',
    iconName: 'KeyRound',
  },
  {
    title: 'Full request log',
    description:
      'Every request keeps status code, latency and token usage so a slow response can always be traced back.',
    iconName: 'ScrollText',
  },
  {
    title: 'Multi-channel routing',
    description:
      'Move traffic between upstreams with weights and affinity rules, and move it back in one click.',
    iconName: 'GitBranch',
  },
  {
    title: 'Quota alerts',
    description:
      'Set a balance threshold once and get notified before the account runs dry mid-traffic.',
    iconName: 'BellRing',
  },
] as const

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

export const STEPS_HEADING_LABEL = 'How it works'
export const STEPS_HEADING = 'Three steps to your first call'

export const HOME_STEPS = [
  {
    num: '1',
    title: 'Claim your key',
    description:
      'Create an account, top up or take the trial quota, and generate an API key for your team.',
    iconName: 'KeyRound',
  },
  {
    num: '2',
    title: 'Swap the base URL',
    description:
      'Point the client at the LUI endpoint. Keep the model name, keep the request body.',
    iconName: 'ArrowLeftRight',
  },
  {
    num: '3',
    title: 'Ship the request',
    description:
      'Call it exactly as you called OpenAI. Usage, cost and latency show up in the console as it lands.',
    iconName: 'Send',
  },
] as const

// ---------------------------------------------------------------------------
// Client compatibility
// ---------------------------------------------------------------------------

export const MODELS_HEADING_LABEL = 'Model matrix'
export const MODELS_HEADING = 'One endpoint for every model family'

export const CLIENTS_HEADING_LABEL = 'Drop-in compatible'
export const CLIENTS_HEADING = 'Works with the tools you already use'

export const HOME_CLIENTS = [
  { name: 'Cherry Studio', icon: 'CherryStudio.Color' },
  { name: 'LobeChat', icon: 'LobeHub.Color' },
  { name: 'OpenWebUI', icon: 'OpenWebUI' },
  { name: 'SillyTavern', icon: 'SillyTavern.Color' },
  { name: 'Dify', icon: 'Dify.Color' },
  { name: 'FastGPT', icon: 'FastGPT.Color' },
  { name: 'Cursor', icon: 'Cursor' },
  { name: 'Claude Code', icon: 'ClaudeCode.Color' },
  { name: 'Codex', icon: 'Codex.Color' },
  { name: 'OpenCode', icon: 'OpenCode' },
  { name: 'Hermes', icon: 'HermesAgent' },
  { name: 'Cline', icon: 'Cline' },
  { name: 'Roo Code', icon: 'RooCode' },
  { name: 'Kilo Code', icon: 'KiloCode' },
  { name: 'Windsurf', icon: 'Windsurf' },
  { name: 'Trae', icon: 'Trae.Color' },
  { name: 'Qoder', icon: 'Qoder.Color' },
  { name: 'Gemini CLI', icon: 'GeminiCLI.Color' },
  { name: 'Devin', icon: 'Devin.Color' },
  { name: 'DeepSeek Harness', icon: 'DeepSeek.Color' },
] as const

export const HOME_MODELS = [
  { name: 'OpenAI', icon: 'OpenAI.Color' },
  { name: 'Claude', icon: 'Claude.Color' },
  { name: 'Gemini', icon: 'Gemini.Color' },
  { name: 'DeepSeek', icon: 'DeepSeek.Color' },
  { name: 'Qwen', icon: 'Qwen.Color' },
  { name: 'Grok', icon: 'Grok.Color' },
  { name: 'Mistral', icon: 'Mistral.Color' },
  { name: 'Kimi', icon: 'Kimi' },
  { name: 'Cohere', icon: 'Cohere.Color' },
  { name: 'Ollama', icon: 'Ollama.Color' },
  { name: 'OpenRouter', icon: 'OpenRouter.Color' },
  { name: 'SiliconFlow', icon: 'SiliconCloud.Color' },
] as const

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------

export const CTA_HEADING_LEAD = 'Three minutes to your'
export const CTA_HEADING_ACCENT = 'first API call'

export const CTA_DESCRIPTION =
  'Register, grab a key, replace one line of config. Every model above becomes reachable from the app you already run.'

export const CTA_FOOTNOTE = 'No credit card required to start.'
