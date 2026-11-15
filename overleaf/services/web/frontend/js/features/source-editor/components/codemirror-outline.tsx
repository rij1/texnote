import { useCodeMirrorStateContext } from './codemirror-context'
import React, { useEffect } from 'react'
import { documentOutline } from '../languages/latex/document-outline'
import { ProjectionStatus } from '../utils/tree-operations/projection'
import useDebounce from '../../../shared/hooks/use-debounce'
import { useOutlineContext } from '@/features/ide-react/context/outline-context'

export const CodemirrorOutline = React.memo(function CodemirrorOutline() {
  const { setFlatOutline } = useOutlineContext()

  const state = useCodeMirrorStateContext()
  const debouncedState = useDebounce(state, 100)
  const outlineResult = debouncedState.field(documentOutline, false)

  // when the outline projection changes, calculate the flat outline
  useEffect(() => {
    if (outlineResult && outlineResult.status !== ProjectionStatus.Pending) {
      let items = outlineResult.items.map(element => ({
        level: element.level,
        title: element.title,
        line: element.line,
      }))
      // Fallback: when document has no standard sections, extract questions and sectioning commands from text
      if (!items.length && state && state.doc) {
        try {
          const docStr = state.doc.toString()
          const lns = docStr.split('\n')
          for (let idx = 0; idx < lns.length; idx++) {
            const trm = lns[idx].trim()
            const mSec = trm.match(
              /^\\(section|subsection|subsubsection|chapter|part)\*?\{([^}]+)\}/
            )
            if (mSec) {
              const lvl =
                mSec[1] === 'part'
                  ? 2
                  : mSec[1] === 'chapter'
                  ? 3
                  : mSec[1] === 'section'
                  ? 4
                  : mSec[1] === 'subsection'
                  ? 5
                  : 6
              items.push({ level: lvl, title: mSec[2].trim(), line: idx + 1 })
              continue
            }
            const mQ = trm.match(/^(?:Q\.?\s*)?([1-9][0-9]?[a-z]?)\s*&\s*([^&]+)/)
            if (mQ) {
              let b = mQ[2]
                .replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{([^}]*)\})?/g, '$3')
                .replace(/[\$\{\}]/g, '')
                .trim()
              if (b.length >= 10) {
                if (b.length > 50) b = b.slice(0, 47) + '...'
                items.push({ level: 4, title: `Q${mQ[1]}: ${b}`, line: idx + 1 })
              }
            }
          }
        } catch (err) {}
      }
      setFlatOutline({
        items,
        partial: outlineResult?.status === ProjectionStatus.Partial,
      })
    } else {
      setFlatOutline(undefined)
    }
  }, [outlineResult, setFlatOutline, state])

  return null
})
