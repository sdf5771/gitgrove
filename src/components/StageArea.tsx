import { useState } from 'react'
import { FileEntry, INIT_UNSTAGED, INIT_STAGED } from '../data/mockData'
import { FilePath } from './FilePath'

interface Props {
  onSelDiffFile: (f: FileEntry) => void
  initialUnstaged?: FileEntry[]
  initialStaged?: FileEntry[]
}

export function StageArea({ onSelDiffFile, initialUnstaged, initialStaged }: Props) {
  const [unstaged, setUnstaged] = useState<FileEntry[]>(initialUnstaged ?? INIT_UNSTAGED)
  const [staged, setStaged] = useState<FileEntry[]>(initialStaged ?? INIT_STAGED)
  const [selU, setSelU] = useState<number | null>(null)
  const [selS, setSelS] = useState<number>(0)
  const [msg, setMsg] = useState('')

  const stageFile = (f: FileEntry) => {
    setUnstaged(p => p.filter(x => x.p !== f.p))
    setStaged(p => [...p, f])
    setSelS(staged.length)
    onSelDiffFile(f)
  }

  const unstageFile = (f: FileEntry) => {
    setStaged(p => p.filter(x => x.p !== f.p))
    setUnstaged(p => [...p, f])
    onSelDiffFile(f)
  }

  return (
    <div className="stage-wrap">
      <div className="stage-cols">
        {/* Unstaged */}
        <div className="scol">
          <div className="scol-hdr">
            <span className="scol-ttl">Unstaged</span>
            <span className="scnt">{unstaged.length}</span>
            <button className="sallbtn" onClick={() => { setStaged(p => [...p, ...unstaged]); setUnstaged([]) }}>
              Stage All
            </button>
          </div>
          <div className="sfl">
            {unstaged.map((f, i) => (
              <div
                key={f.p}
                className={`sfi${selU === i ? ' on' : ''}`}
                onClick={() => { setSelU(i); onSelDiffFile(f) }}
              >
                <button className="sact" onClick={e => { e.stopPropagation(); stageFile(f) }} title="Stage">+</button>
                <span className={`fst fst-${f.s}`}>{f.s}</span>
                <FilePath path={f.p} />
                <span className="fstats">
                  <span className="fadd">+{f.a}</span>
                  <span className="fdel">−{f.d}</span>
                </span>
              </div>
            ))}
            {unstaged.length === 0 && (
              <div style={{ padding:'20px 12px', color:'var(--c-text-faint)', fontSize:12, textAlign:'center' }}>
                No unstaged changes
              </div>
            )}
          </div>
        </div>

        {/* Staged */}
        <div className="scol">
          <div className="scol-hdr">
            <span className="scol-ttl">Staged</span>
            <span className="scnt">{staged.length}</span>
            <button className="sallbtn" onClick={() => { setUnstaged(p => [...p, ...staged]); setStaged([]) }}>
              Unstage All
            </button>
          </div>
          <div className="sfl">
            {staged.map((f, i) => (
              <div
                key={f.p}
                className={`sfi${selS === i ? ' on' : ''}`}
                onClick={() => { setSelS(i); onSelDiffFile(f) }}
              >
                <button className="sact" onClick={e => { e.stopPropagation(); unstageFile(f) }} title="Unstage">−</button>
                <span className={`fst fst-${f.s}`}>{f.s}</span>
                <FilePath path={f.p} />
                <span className="fstats">
                  <span className="fadd">+{f.a}</span>
                  <span className="fdel">−{f.d}</span>
                </span>
              </div>
            ))}
            {staged.length === 0 && (
              <div style={{ padding:'20px 12px', color:'var(--c-text-faint)', fontSize:12, textAlign:'center' }}>
                No staged files
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Commit area */}
      <div className="cmt-area">
        <textarea
          className="cmt-input"
          rows={3}
          placeholder="Commit message (required)…"
          value={msg}
          onChange={e => setMsg(e.target.value)}
        />
        <div className="cmt-btns">
          <button className="amnd">↩ Amend</button>
          <button
            className="cmt-btn"
            disabled={staged.length === 0 || !msg.trim()}
          >
            Commit {staged.length} {staged.length === 1 ? 'file' : 'files'} →
          </button>
        </div>
      </div>
    </div>
  )
}
