import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/modal'

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descId = useId()
  useModal(open)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus() // 安全側（キャンセル）に置く
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      e.preventDefault() // 詳細の Esc（棚へ戻る）まで届かせない
      onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      data-modal
      className="fixed inset-0 z-[60] grid place-items-center px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div aria-hidden onClick={onCancel} className="absolute inset-0 bg-stage/75" />
      {/* 舞台から切り出す：角丸2px・影無し・ヘアライン一本だけ */}
      <div className="relative w-full max-w-[320px] rounded-[2px] border border-rule bg-surface p-6">
        <h2 id={titleId} className="text-[15px] font-medium text-ink-1">
          {title}
        </h2>
        {description && (
          <p id={descId} className="mt-2 text-[13px] leading-[1.6] text-ink-2">
            {description}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-[2px] px-4 text-[14px] text-ink-2 transition hover:text-ink-1 active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] rounded-[2px] border border-rule px-4 text-[14px] text-ink-1 transition hover:border-ink-3 active:scale-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
