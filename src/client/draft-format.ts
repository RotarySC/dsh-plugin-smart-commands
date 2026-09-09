import type { InventoryTemplate } from '../types/catalog.js'

/**
 * Format the draft text to be inserted when selecting a template.
 * If existing draft text is empty, returns `/<slashName> ` (or `/<name> `).
 * If existing draft is non-empty, appends the command on a new line below it
 * so consecutive prompt-menu clicks stack downward.
 */
export function formatTemplateDraft(existingDraft: string, item: InventoryTemplate): string {
  const cmdText = item.slashName ? `/${item.slashName} ` : `/${item.name} `
  if (!existingDraft || !existingDraft.trim()) {
    return cmdText
  }
  return `${existingDraft.trimEnd()}\n${cmdText}`
}

export interface ComposerDraftSources {
  readonly liveDraft?: string
  readonly input?: { readonly draft?: string; readonly text?: string }
  readonly ownerInput?: { readonly draft?: string; readonly text?: string }
  readonly textareaValue?: string
  readonly contentEditableText?: string
}

/**
 * Resolve the composer draft after DSH moved InputState to `draft` and the
 * composer from `<textarea>` to a Lexical `[data-composer-input]` surface.
 * Session-scope slots should pass `useInput(s => s.draft)` as `liveDraft`.
 */
export function resolveComposerDraft(sources: ComposerDraftSources): string {
  if (typeof sources.liveDraft === 'string') return sources.liveDraft
  if (typeof sources.input?.draft === 'string') return sources.input.draft
  if (typeof sources.input?.text === 'string') return sources.input.text
  if (typeof sources.ownerInput?.draft === 'string') return sources.ownerInput.draft
  if (typeof sources.ownerInput?.text === 'string') return sources.ownerInput.text
  if (typeof sources.textareaValue === 'string') return sources.textareaValue
  if (typeof sources.contentEditableText === 'string') return sources.contentEditableText
  return ''
}

/** Append a keyword so consecutive clicks accumulate instead of replacing. */
export function appendKeywordToDraft(currentDraft: string, keyword: string): string {
  const trimmed = currentDraft.trimEnd()
  return trimmed.length > 0 ? `${trimmed} ${keyword} ` : `${keyword} `
}

const COMPOSER_SELECTOR = '[data-composer-input="true"]'

export function readComposerDomDraft(): string {
  if (typeof document === 'undefined') return ''
  const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR)
  if (composer) return composer.innerText ?? composer.textContent ?? ''
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea')
  if (textarea) return textarea.value
  const editable = document.querySelector<HTMLElement>('[contenteditable="true"]')
  if (editable) return editable.innerText ?? editable.textContent ?? ''
  return ''
}

export function focusComposer(): void {
  if (typeof document === 'undefined') return
  const composer = document.querySelector<HTMLElement>(`${COMPOSER_SELECTOR}, [contenteditable="true"], textarea`)
  composer?.focus()
}
