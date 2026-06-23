// 첫 실행 온보딩("첫 경험") — 그루가 안내하는 4단계 풀스크린 오버레이.
// Claude Design 「GitGrove 첫 경험.html」 명세 포팅. 그루는 기존 Geuru 컴포넌트,
// 완료 단계 나무(새싹)는 기존 Tree 컴포넌트(stage=0)를 재사용한다.
import { useState, useEffect } from 'react'
import { Geuru } from './Geuru'
import { Tree } from './Tree'

interface Props {
  // 모든 종료 경로(건너뛰기·완료·Esc)에서 호출 — 호출부에서 키 저장 후 오버레이 제거.
  onClose: () => void
  // 서비스 연결 카드의 "연결" 클릭 → 해당 설정 탭을 연다.
  onConnectGithub: () => void
  onConnectGitlab: () => void
}

const STEPS = ['환영', '서비스 연결', '사용법', '완료'] as const

export function Onboarding({ onClose, onConnectGithub, onConnectGitlab }: Props) {
  const [step, setStep] = useState(0)

  // Esc로 닫기(종료 경로).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const goNext = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const goPrev = () => setStep(s => Math.max(s - 1, 0))

  return (
    <div className="ob-bd" role="dialog" aria-modal="true" aria-label="첫 경험 안내">
      <div className="ob-box">
        {/* 진행 레일 */}
        <div className="ob-rail">
          {STEPS.map((label, i) => (
            <div key={label} className={`ob-rail-step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}>
              <span className="ob-rail-dot" />
              <span className="ob-rail-label">{label}</span>
            </div>
          ))}
        </div>

        {/* 건너뛰기 */}
        <button type="button" className="ob-skip" onClick={onClose}>건너뛰기</button>

        {/* 단계 본문 */}
        <div className="ob-body" key={step}>
          {step === 0 && (
            <div className="ob-stage">
              <Geuru expr="happy" scale={6} title="그루" className="ob-geuru-bob" />
              <h2 className="ob-title">안녕하세요, <span className="ob-accent">그루</span>예요</h2>
              <p className="ob-sub">
                GitGrove에 오신 걸 환영해요. 여러분의 저장소가 자라는 걸 돌보는 정원지기예요.
                커밋 하나 · 새싹 하나 — 함께 정원을 가꿔봐요.
              </p>
              <span className="ob-badge">한 창에서 끝내는 macOS Git GUI</span>
            </div>
          )}

          {step === 1 && (
            <div className="ob-stage">
              <Geuru expr="idle" scale={5} title="그루" />
              <h2 className="ob-title">서비스를 연결할까요?</h2>
              <p className="ob-sub">나중에 설정에서도 연결할 수 있어요.</p>
              <div className="ob-cards">
                <div className="ob-card">
                  <div className="ob-card-name">GitHub</div>
                  <div className="ob-card-desc">PR·이슈·알림을 한곳에서</div>
                  <button type="button" className="ob-card-btn" onClick={onConnectGithub}>연결</button>
                </div>
                <div className="ob-card">
                  <div className="ob-card-name">GitLab</div>
                  <div className="ob-card-desc">MR·파이프라인을 한곳에서</div>
                  <button type="button" className="ob-card-btn" onClick={onConnectGitlab}>연결</button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ob-stage">
              <Geuru expr="happy" scale={5} title="그루" />
              <h2 className="ob-title">세 가지만 <span className="ob-accent">알면 돼요</span></h2>
              <div className="ob-tips">
                <div className="ob-tip">
                  <div className="ob-tip-name">저장소 가져오기</div>
                  <div className="ob-tip-desc">Clone · 폴더 열기 · 새로 만들기</div>
                </div>
                <div className="ob-tip">
                  <div className="ob-tip-name">함께 동기화</div>
                  <div className="ob-tip-desc">Pull · Push 중 그루가 단계를 안내해요</div>
                </div>
                <div className="ob-tip">
                  <div className="ob-tip-name">명령 팔레트</div>
                  <div className="ob-tip-desc">⌘K 로 어디서든 빠르게</div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="ob-stage">
              <div className="ob-sprout-wrap">
                <span className="ob-tree">
                  <Tree stage={0} scale={6} title="새싹" />
                </span>
                <span className="ob-sparkle" aria-hidden="true" />
              </div>
              <h2 className="ob-title">이제 <span className="ob-accent">준비됐어요!</span></h2>
              <p className="ob-sub">첫 저장소를 심으면 그루가 함께 자라요.</p>
              <div className="ob-chips">
                <span className="ob-chip">히스토리</span>
                <span className="ob-chip">Diff 탐색기</span>
                <span className="ob-chip">PR · MR 리뷰</span>
              </div>
            </div>
          )}
        </div>

        {/* 하단 네비 */}
        <div className="ob-nav">
          <button
            type="button"
            className="ob-nav-arrow"
            onClick={goPrev}
            disabled={step === 0}
            aria-label="이전"
          >‹</button>

          <div className="ob-dots">
            {STEPS.map((label, i) => (
              <span key={label} className={`ob-dot${i === step ? ' on' : ''}`} aria-hidden="true" />
            ))}
          </div>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="ob-nav-arrow"
              onClick={goNext}
              aria-label="다음"
            >›</button>
          ) : (
            <span className="ob-nav-arrow ob-nav-arrow-spacer" aria-hidden="true" />
          )}
        </div>

        {/* 주 버튼 */}
        <div className="ob-actions">
          {step === 1 && (
            <button type="button" className="ob-ghost" onClick={onClose}>지금은 건너뛰기</button>
          )}
          {step === 0 && (
            <button type="button" className="ob-primary" onClick={goNext}>시작할게요 →</button>
          )}
          {step === 1 && (
            <button type="button" className="ob-primary" onClick={goNext}>다음 →</button>
          )}
          {step === 2 && (
            <button type="button" className="ob-primary" onClick={goNext}>알겠어요 →</button>
          )}
          {step === 3 && (
            <button type="button" className="ob-primary" onClick={onClose}>그로브 둘러보기 →</button>
          )}
        </div>
      </div>
    </div>
  )
}
