import React, { useEffect, useState } from 'react'
import { Loader2, Presentation } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { parsePresentationText, type PresentationSlide } from './office-document-parse'

const PPTX_PREVIEW_TIMEOUT_MS = 4_000

type PptxPreviewer = {
  preview: (buffer: ArrayBuffer) => Promise<unknown> | unknown
  destroy?: () => void
}

function PresentationTextFallback({
  reason,
  slides
}: {
  reason: string | null
  slides: PresentationSlide[]
}): React.JSX.Element {
  return (
    <div className="h-full overflow-auto bg-muted p-6 scrollbar-editor">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        {reason ? (
          <div className="rounded-md border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
            {reason}
          </div>
        ) : null}
        {slides.map((slide) => (
          <section
            key={slide.number}
            className="aspect-video overflow-auto rounded-md border border-border bg-background p-8 shadow-xs"
          >
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Presentation className="size-4" />
              {translate('auto.components.editor.OfficeDocumentViewer.slide', 'Slide')}{' '}
              {slide.number}
            </div>
            <div className="space-y-3 text-foreground">
              {slide.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export function OfficePresentationView({ buffer }: { buffer: ArrayBuffer }): React.JSX.Element {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)
  const [fallback, setFallback] = useState<{
    reason: string | null
    slides: PresentationSlide[]
  } | null>(null)

  useEffect(() => {
    let active = true
    let previewCompleted = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let previewer: PptxPreviewer | null = null
    const host = hostRef.current
    if (!host) {
      return
    }
    host.replaceChildren()
    setError(null)
    setRendered(false)
    setFallback(null)

    const clearWrapperBackground = (): void => {
      host
        .querySelector<HTMLElement>('.pptx-preview-wrapper')
        ?.style.setProperty('background', 'transparent')
    }

    const renderFallback = (reason: string | null): void => {
      previewCompleted = true
      host.replaceChildren()
      void parsePresentationText(buffer).then(
        (slides) => {
          if (active) {
            setFallback({ reason, slides })
          }
        },
        (fallbackReason: unknown) => {
          if (active) {
            const fallbackMessage =
              fallbackReason instanceof Error ? fallbackReason.message : String(fallbackReason)
            setError(reason ? `${reason} ${fallbackMessage}` : fallbackMessage)
          }
        }
      )
    }

    timeoutId = setTimeout(() => {
      if (!active || previewCompleted) {
        return
      }
      renderFallback(
        translate(
          'auto.components.editor.OfficeDocumentViewer.renderFallback',
          'PowerPoint visual preview did not finish. Showing extracted slide text instead.'
        )
      )
    }, PPTX_PREVIEW_TIMEOUT_MS)

    void import('pptx-preview').then(
      ({ init }) => {
        if (!active) {
          return
        }
        previewer = init(host, { width: 960, height: 540 })
        clearWrapperBackground()
        void Promise.resolve(previewer.preview(buffer)).then(
          () => {
            if (!active) {
              return
            }
            previewCompleted = true
            clearWrapperBackground()
            if (host.querySelectorAll('.pptx-preview-slide-wrapper').length > 0) {
              setRendered(true)
              return
            }
            renderFallback(
              translate(
                'auto.components.editor.OfficeDocumentViewer.renderEmptyFallback',
                'PowerPoint visual preview rendered no slides. Showing extracted slide text instead.'
              )
            )
          },
          (reason: unknown) => {
            if (!active) {
              return
            }
            previewCompleted = true
            const message = reason instanceof Error ? reason.message : String(reason)
            renderFallback(
              `${translate(
                'auto.components.editor.OfficeDocumentViewer.renderErrorFallback',
                'PowerPoint visual preview failed. Showing extracted slide text instead.'
              )} ${message}`
            )
          }
        )
      },
      (reason: unknown) => {
        if (!active) {
          return
        }
        const message = reason instanceof Error ? reason.message : String(reason)
        renderFallback(
          `${translate(
            'auto.components.editor.OfficeDocumentViewer.renderLoadFallback',
            'PowerPoint visual preview could not load. Showing extracted slide text instead.'
          )} ${message}`
        )
      }
    )

    return () => {
      active = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      previewer?.destroy?.()
      host.replaceChildren()
    }
  }, [buffer])

  if (fallback) {
    return <PresentationTextFallback reason={fallback.reason} slides={fallback.slides} />
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-auto bg-muted p-6 scrollbar-editor">
      {!rendered ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 shadow-xs">
            <Loader2 className="size-4 animate-spin" />
            {translate(
              'auto.components.editor.OfficeDocumentViewer.renderingPresentation',
              'Rendering presentation...'
            )}
          </div>
        </div>
      ) : null}
      <div ref={hostRef} className="mx-auto min-h-[540px] w-[960px] max-w-full" />
    </div>
  )
}
