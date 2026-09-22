import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import {
  Accessibility, ArrowLeft, ArrowRight, Camera, Check, Eye,
  Hand, Heart, Maximize2, MessageCircle, MousePointer2, Palette,
  Pause, Play, RotateCcw, Sparkles, Volume2,
} from 'lucide-react'

type CameraState = 'off' | 'loading' | 'active' | 'error'
type Point = { x: number; y: number }

const dwellMs = 1200
const blankArtColor = '#fffdf8'
const artRegionCount = 10

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ])
}

const messages = [
  { emoji: '👋', text: '안녕! 만나서 반가워.' },
  { emoji: '🤝', text: '같이 해볼래?' },
  { emoji: '💡', text: '나는 이런 방법으로 소통해.' },
  { emoji: '💛', text: '고마워!' },
]

const classroomMissions = [
  {
    title: '손으로 마우스를 사용하기 어려운 친구',
    prompt: '어떤 도구가 도움이 될까요?',
    options: ['눈마우스', '더 작은 마우스', '마우스 없애기'],
    correct: 0,
    explain: '눈이나 얼굴 움직임을 입력으로 바꾸면 자신의 방법으로 컴퓨터를 사용할 수 있어요.',
  },
  {
    title: '버튼을 정확히 선택하기 어려운 친구',
    prompt: '화면을 어떻게 바꾸면 좋을까요?',
    options: ['버튼을 더 빠르게 움직이기', '큰 버튼과 넓은 간격', '모든 버튼 숨기기'],
    correct: 1,
    explain: '큰 버튼과 넓은 간격은 선택 실수를 줄여 모두에게 편한 화면을 만들어요.',
  },
  {
    title: '말로 의사를 표현하기 어려운 친구',
    prompt: '소통을 위해 무엇을 준비할까요?',
    options: ['그림·글자 의사소통판', '대화하지 않기', '더 크게 말하기'],
    correct: 0,
    explain: '그림과 글자, 음성을 활용하면 여러 방법으로 생각을 나눌 수 있어요.',
  },
]

const typecastAudioByText: Record<string, string> = {
  '안녕! 만나서 반가워.': 'hello.mp3',
  '같이 해볼래?': 'together.mp3',
  '나는 이런 방법으로 소통해.': 'my-way.mp3',
  '고마워!': 'thanks.mp3',
  '눈이나 얼굴 움직임을 입력으로 바꾸면 자신의 방법으로 컴퓨터를 사용할 수 있어요.': 'mission-eye-mouse.mp3',
  '큰 버튼과 넓은 간격은 선택 실수를 줄여 모두에게 편한 화면을 만들어요.': 'mission-large-buttons.mp3',
  '그림과 글자, 음성을 활용하면 여러 방법으로 생각을 나눌 수 있어요.': 'mission-communication.mp3',
}

function App() {
  const [step, setStep] = useState(0)
  const [cameraState, setCameraState] = useState<CameraState>('off')
  const [paused, setPaused] = useState(false)
  const [pointer, setPointer] = useState<Point>({ x: innerWidth / 2, y: innerHeight / 2 })
  const [dwellProgress, setDwellProgress] = useState(0)
  const [toast, setToast] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null)
  const [mission, setMission] = useState(0)
  const [missionResult, setMissionResult] = useState<'correct' | 'try' | null>(null)
  const [paint, setPaint] = useState('#ef6f51')
  const [tiles, setTiles] = useState<string[]>(Array(artRegionCount).fill(blankArtColor))
  const [reflection, setReflection] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const animationRef = useRef(0)
  const rawFaceRef = useRef<Point | null>(null)
  const centerRef = useRef<Point | null>(null)
  const smoothRef = useRef<Point>({ x: innerWidth / 2, y: innerHeight / 2 })
  const dwellRef = useRef<{ el: HTMLElement | SVGElement | null; start: number; fired: boolean }>({ el: null, start: 0, fired: false })
  const pausedRef = useRef(false)
  const cameraStateRef = useRef<CameraState>('off')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { cameraStateRef.current = cameraState }, [cameraState])

  const announce = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }, [])

  const processDwell = useCallback((point: Point, now: number) => {
    if (pausedRef.current) return
    const el = document.elementFromPoint(point.x, point.y)?.closest('[data-dwell]') as (HTMLElement | SVGElement) | null
    if (!el || el.getAttribute('aria-disabled') === 'true') {
      dwellRef.current = { el: null, start: 0, fired: false }
      setDwellProgress(0)
      return
    }
    if (dwellRef.current.el !== el) {
      dwellRef.current = { el, start: now, fired: false }
      setDwellProgress(0)
      return
    }
    const progress = Math.min(1, (now - dwellRef.current.start) / dwellMs)
    setDwellProgress(progress)
    if (progress >= 1 && !dwellRef.current.fired) {
      dwellRef.current.fired = true
      if ('click' in el && typeof el.click === 'function') el.click()
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      window.setTimeout(() => {
        dwellRef.current = { el: null, start: 0, fired: false }
        setDwellProgress(0)
      }, 450)
    }
  }, [])

  const trackingLoop = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (video && landmarker && video.readyState >= 2 && cameraStateRef.current === 'active') {
      const result = landmarker.detectForVideo(video, performance.now())
      const nose = result.faceLandmarks?.[0]?.[1]
      if (nose) {
        const raw = { x: 1 - nose.x, y: nose.y }
        rawFaceRef.current = raw
        if (!centerRef.current) centerRef.current = raw
        if (!pausedRef.current) {
          const center = centerRef.current
          const target = {
            x: innerWidth / 2 + (raw.x - center.x) * innerWidth * 4.2,
            y: innerHeight / 2 + (raw.y - center.y) * innerHeight * 5.2,
          }
          target.x = Math.max(22, Math.min(innerWidth - 22, target.x))
          target.y = Math.max(22, Math.min(innerHeight - 22, target.y))
          smoothRef.current = {
            x: smoothRef.current.x * 0.76 + target.x * 0.24,
            y: smoothRef.current.y * 0.76 + target.y * 0.24,
          }
          setPointer(smoothRef.current)
          processDwell(smoothRef.current, performance.now())
        }
      }
    }
    animationRef.current = requestAnimationFrame(trackingLoop)
  }, [processDwell])

  const startCamera = async () => {
    setCameraState('loading')
    cameraStateRef.current = 'loading'
    let stream: MediaStream | null = null
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('이 브라우저는 카메라 사용을 지원하지 않습니다.')
      }
      stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false }),
        10000,
        '카메라 권한 응답 시간이 초과됐습니다.',
      )
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await withTimeout(videoRef.current.play(), 5000, '카메라 영상을 재생할 수 없습니다.')
      const vision = await withTimeout(
        FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'),
        15000,
        '얼굴 인식 모델을 불러오지 못했습니다.',
      )
      landmarkerRef.current = await withTimeout(FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
      }), 15000, '얼굴 인식기를 준비하지 못했습니다.')
      centerRef.current = null
      setCameraState('active')
      cameraStateRef.current = 'active'
      cancelAnimationFrame(animationRef.current)
      animationRef.current = requestAnimationFrame(trackingLoop)
      announce('카메라가 준비됐어요. 정면을 보고 중앙 맞추기를 눌러주세요.')
    } catch (error) {
      console.error(error)
      stream?.getTracks().forEach(track => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
      setCameraState('error')
      cameraStateRef.current = 'error'
      announce('카메라를 시작하지 못했어요. 마우스로도 모든 체험을 할 수 있어요.')
    }
  }

  const calibrate = () => {
    if (rawFaceRef.current) {
      centerRef.current = { ...rawFaceRef.current }
      smoothRef.current = { x: innerWidth / 2, y: innerHeight / 2 }
      setPointer(smoothRef.current)
      announce('중앙을 맞춰어요. 얼굴을 천천히 움직여 보세요.')
    }
  }

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current)
    const stream = videoRef.current?.srcObject as MediaStream | null
    stream?.getTracks().forEach(track => track.stop())
    landmarkerRef.current?.close()
  }, [])

  const speakWithBrowser = (text: string) => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'ko-KR'
      speechSynthesis.speak(utterance)
    }
  }

  const speak = (text: string) => {
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()

    const file = typecastAudioByText[text]
    if (!file) {
      speakWithBrowser(text)
      return
    }

    const audio = new Audio(`${import.meta.env.BASE_URL}audio/typecast/${file}`)
    audioRef.current = audio
    let usedFallback = false
    const fallback = () => {
      if (usedFallback) return
      usedFallback = true
      speakWithBrowser(text)
    }
    audio.addEventListener('error', fallback, { once: true })
    audio.play().catch(fallback)
  }

  const chooseMission = (index: number) => {
    if (index === classroomMissions[mission].correct) {
      setMissionResult('correct')
      speak(classroomMissions[mission].explain)
    } else {
      setMissionResult('try')
      announce('사람을 바꾸는 대신, 도구나 환경을 바꾸는 방법을 생각해 봐요.')
    }
  }

  const nextMission = () => {
    if (mission < classroomMissions.length - 1) {
      setMission(mission + 1)
      setMissionResult(null)
    } else {
      setStep(4)
    }
  }

  const restart = () => {
    setStep(0); setMission(0); setMissionResult(null); setSelectedMessage(null)
    setTiles(Array(artRegionCount).fill(blankArtColor)); setReflection(null)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={restart} aria-label="처음으로">
          <span className="brand-mark"><Eye size={23} /></span>
          <span><b>눈으로 여는 교실</b><small>다른 방법, 같은 가능성</small></span>
        </button>
        <div className="header-actions">
          {cameraState === 'active' && <button className="icon-button" onClick={() => setPaused(!paused)} aria-label={paused ? '재개' : '일시정지'}>{paused ? <Play /> : <Pause />}</button>}
          <button className="icon-button" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="전체화면"><Maximize2 /></button>
        </div>
      </header>

      {step > 0 && <nav className="journey" aria-label="체험 단계">
        {['만나기', '움직이기', '소통하기', '바꾸기', '만들기', '생각하기'].map((label, i) => (
          <div key={label} className={`journey-step ${i === step ? 'current' : ''} ${i < step ? 'done' : ''}`}>
            <span>{i < step ? <Check size={15} /> : i + 1}</span><em>{label}</em>
          </div>
        ))}
      </nav>}

      <main>
        {step === 0 && <Landing onStart={() => setStep(1)} />}
        {step === 1 && <Practice cameraState={cameraState} startCamera={startCamera} calibrate={calibrate} onNext={() => setStep(2)} />}
        {step === 2 && <Communication selected={selectedMessage} onSelect={(i) => { setSelectedMessage(i); speak(messages[i].text) }} onNext={() => setStep(3)} />}
        {step === 3 && <Classroom mission={mission} result={missionResult} onChoose={chooseMission} onNext={nextMission} />}
        {step === 4 && <Art paint={paint} setPaint={setPaint} tiles={tiles} setTiles={setTiles} onNext={() => setStep(5)} />}
        {step === 5 && <Reflection selected={reflection} setSelected={setReflection} restart={restart} />}
      </main>

      <video ref={videoRef} className={cameraState === 'active' ? 'camera-preview' : 'camera-preview hidden'} muted playsInline aria-label="카메라 미리보기" />
      {cameraState === 'active' && <div className={`gaze-cursor ${paused ? 'paused' : ''}`} style={{ left: pointer.x, top: pointer.y }} aria-hidden="true">
        <svg viewBox="0 0 44 44"><circle className="cursor-track" cx="22" cy="22" r="18" /><circle className="cursor-progress" cx="22" cy="22" r="18" style={{ strokeDashoffset: 113 - 113 * dwellProgress }} /></svg>
        <span />
      </div>}
      {paused && <div className="pause-banner">눈마우스가 쉬고 있어요</div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

function Landing({ onStart }: { onStart: () => void }) {
  return <section className="landing page">
    <div className="landing-copy">
      <p className="eyebrow"><Accessibility size={18} /> 장애공감 보조기술 체험</p>
      <h1>우리의 눈은<br /><span>또 하나의 마우스</span>입니다.</h1>
      <p className="lead">손을 쓰지 않고도 선택하고, 소통하고, 작품을 만들 수 있어요.<br />방법이 다를 뿐, 가능성은 같으니까요.</p>
      <button data-dwell className="primary jumbo" onClick={onStart}>체험 시작하기 <ArrowRight /></button>
      <p className="hint"><MousePointer2 size={16} /> 처음에는 마우스로 눌러도 돼요.</p>
    </div>
    <div className="hero-art" aria-hidden="true">
      <div className="sun" />
      <div className="school-character-frame">
        <img src={`${import.meta.env.BASE_URL}characters/sunflower-girl-front.png`} alt="" />
      </div>
      <div className="orbit orbit-one"><MessageCircle /></div>
      <div className="orbit orbit-two"><Palette /></div>
      <div className="orbit orbit-three"><Heart /></div>
    </div>
  </section>
}

function Practice({ cameraState, startCamera, calibrate, onNext }: { cameraState: CameraState; startCamera: () => void; calibrate: () => void; onNext: () => void }) {
  return <section className="page narrow">
    <PageTitle number="01" icon={<Eye />} title="눈마우스와 친해져요" subtitle="카메라는 눈과 얼굴의 움직임을 컴퓨터에 전달해요." />
    <div className="practice-grid">
      <article className="card camera-card">
        <div className={`camera-illustration ${cameraState}`}><Camera size={54} /><span>{cameraState === 'active' ? '얼굴 인식 중' : '웹캠'}</span></div>
        <h2>{cameraState === 'active' ? '준비됐어요!' : '카메라를 켜 볼까요?'}</h2>
        <p>{cameraState === 'active' ? '정면을 보고 중앙 맞추기를 누른 뒤, 얼굴을 천천히 움직여 보세요.' : '카메라 영상은 서버로 전송되거나 저장되지 않아요.'}</p>
        {cameraState !== 'active' && <button data-dwell className="primary" onClick={startCamera} disabled={cameraState === 'loading'}>{cameraState === 'loading' ? '카메라 준비 중…' : <><Camera /> {cameraState === 'error' ? '카메라 다시 시도' : '카메라 시작'}</>}</button>}
        {cameraState === 'active' && <button data-dwell className="primary" onClick={calibrate}><Eye /> 중앙 맞추기</button>}
        {cameraState === 'error' && <p className="error-note">현재 브라우저에서 카메라를 준비하지 못했어요. Chrome·Edge에서 다시 시도하거나, 마우스로 계속 체험해 보세요.</p>}
      </article>
      <article className="card how-card">
        <h2>어떻게 선택하나요?</h2>
        <div className="how-step"><span>1</span><div><b>움직이기</b><p>얼굴을 살짝 움직여 화면의 선택점을 옮겨요.</p></div></div>
        <div className="how-step"><span>2</span><div><b>머무르기</b><p>원하는 버튼 위에서 약 1초간 머물러요.</p></div></div>
        <div className="how-step"><span>3</span><div><b>선택하기</b><p>원이 차면 손을 쓰지 않고도 선택이 완료돼요.</p></div></div>
        <div className="try-target"><Sparkles /><b>이 버튼 위에 머물러 보세요</b></div>
      </article>
    </div>
    <PageNav back={() => {}} next={onNext} hideBack nextLabel="소통하러 가기" />
  </section>
}

function Communication({ selected, onSelect, onNext }: { selected: number | null; onSelect: (i: number) => void; onNext: () => void }) {
  return <section className="page narrow">
    <PageTitle number="02" icon={<MessageCircle />} title="눈으로 마음을 전해요" subtitle="소통은 말로만 하는 것이 아니에요. 전하고 싶은 말을 선택해 보세요." />
    <div className="message-scene">
      <div className="friend" aria-hidden="true"><div className="friend-character"><img src={`${import.meta.env.BASE_URL}characters/mountain-boy-front.png`} alt="" /></div><p>산이에게 무슨 말을 전하고 싶나요?</p></div>
      <div className="message-options">
        {messages.map((message, i) => <button data-dwell className={`message-button ${selected === i ? 'selected' : ''}`} key={message.text} onClick={() => onSelect(i)}><span>{message.emoji}</span><b>{message.text}</b>{selected === i && <Volume2 />}</button>)}
      </div>
    </div>
    {selected !== null && <div className="success-strip"><Sparkles /> <b>생각을 전했어요!</b> 도구는 다르지만 우리는 서로 소통할 수 있어요.</div>}
    <PageNav back={() => {}} next={onNext} hideBack nextLabel="교실을 바꾸러 가기" disabled={selected === null} />
  </section>
}

function Classroom({ mission, result, onChoose, onNext }: { mission: number; result: 'correct' | 'try' | null; onChoose: (i: number) => void; onNext: () => void }) {
  const item = classroomMissions[mission]
  return <section className="page narrow">
    <PageTitle number="03" icon={<Accessibility />} title="모두의 교실을 만들어요" subtitle="사람을 바꾸기보다, 도구와 환경을 바꾸면 됩니다." />
    <div className="mission-count">MISSION {mission + 1} <span>/ {classroomMissions.length}</span></div>
    <article className="mission-card">
      <div className="mission-visual"><span>{mission === 0 ? '🖥️' : mission === 1 ? '🔘' : '💬'}</span><div className="desk" /></div>
      <div className="mission-copy"><p className="situation">{item.title}</p><h2>{item.prompt}</h2>
        <div className="choice-list">{item.options.map((option, i) => <button data-dwell key={option} onClick={() => onChoose(i)} className={result === 'correct' && i === item.correct ? 'right' : ''} disabled={result === 'correct'}><span>{String.fromCharCode(65 + i)}</span>{option}{result === 'correct' && i === item.correct && <Check />}</button>)}</div>
      </div>
    </article>
    {result === 'correct' && <div className="explanation"><div><Check /></div><p><b>환경을 바꾸었어요!</b>{item.explain}</p></div>}
    {result === 'try' && <div className="gentle-hint">💡 사람을 바꾸는 대신 도구나 환경을 바꾸는 방법을 골라 보세요.</div>}
    <PageNav back={() => {}} next={onNext} hideBack nextLabel={mission < 2 ? '다음 미션' : '작품 만들러 가기'} disabled={result !== 'correct'} />
  </section>
}

function Art({ paint, setPaint, tiles, setTiles, onNext }: { paint: string; setPaint: (c: string) => void; tiles: string[]; setTiles: (t: string[]) => void; onNext: () => void }) {
  const colors = ['#ef6f51', '#f4b942', '#48a9a6', '#4f6d7a', '#7b5ea7', '#2d8a5b']
  const colored = tiles.filter(c => c !== blankArtColor).length
  const colorRegion = (index: number) => {
    const next = [...tiles]
    next[index] = paint
    setTiles(next)
  }
  const regionProps = (index: number, label: string) => ({
    'data-dwell': true,
    role: 'button',
    tabIndex: 0,
    'aria-label': `${label} 색칠하기`,
    fill: tiles[index],
    onClick: () => colorRegion(index),
    onKeyDown: (event: React.KeyboardEvent<SVGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') colorRegion(index)
    },
  })
  return <section className="page narrow">
    <PageTitle number="04" icon={<Palette />} title="눈으로 작품을 만들어요" subtitle="원하는 색을 고르고 선화 안의 넓은 영역을 선택해 모덕의 풍경을 완성하세요." />
    <div className="art-studio">
      <aside className="palette-panel"><h2>색을 골라요</h2><div className="color-list">{colors.map(c => <button data-dwell aria-label={`색상 ${c}`} key={c} className={paint === c ? 'active' : ''} style={{ backgroundColor: c }} onClick={() => setPaint(c)}>{paint === c && <Check />}</button>)}</div><button data-dwell className="secondary" onClick={() => setTiles(Array(artRegionCount).fill(blankArtColor))}><RotateCcw /> 다시 그리기</button></aside>
      <div className="canvas-wrap">
        <svg className="coloring-svg" viewBox="0 0 760 500" aria-label="모덕초등학교와 자연 선화">
          <rect {...regionProps(0, '하늘')} x="8" y="8" width="744" height="484" rx="18" />
          <circle {...regionProps(1, '해')} cx="650" cy="92" r="54" />
          <path {...regionProps(2, '산')} d="M10 300 L150 138 L245 240 L360 104 L520 300 Z" />
          <path {...regionProps(3, '들판')} d="M8 322 Q160 280 310 324 T752 314 L752 492 L8 492 Z" />
          <rect {...regionProps(4, '학교 건물')} x="260" y="245" width="300" height="198" rx="4" />
          <path {...regionProps(5, '학교 지붕')} d="M230 250 L410 145 L590 250 Z" />
          <rect {...regionProps(6, '학교 문')} x="374" y="340" width="72" height="103" rx="4" />
          <g {...regionProps(7, '왼쪽 해바라기')}>
            <circle cx="120" cy="365" r="25" /><path d="M120 335 C83 305 75 350 102 360 C72 372 84 408 113 388 C118 424 157 413 139 383 C175 394 181 354 145 355 C161 325 132 311 120 335 Z" />
          </g>
          <g {...regionProps(8, '오른쪽 해바라기')}>
            <circle cx="650" cy="382" r="25" /><path d="M650 352 C613 322 605 367 632 377 C602 389 614 425 643 405 C648 441 687 430 669 400 C705 411 711 371 675 372 C691 342 662 328 650 352 Z" />
          </g>
          <path {...regionProps(9, '길')} d="M382 443 L438 443 L508 492 L315 492 Z" />
          <g className="line-details" aria-hidden="true">
            <rect x="293" y="284" width="56" height="49" rx="3" /><rect x="471" y="284" width="56" height="49" rx="3" />
            <path d="M410 145 V214 M380 185 H440" /><path d="M120 407 V472 M650 424 V480" />
            <path d="M92 430 Q120 408 148 430 M622 447 Q650 425 678 447" />
          </g>
        </svg>
        <p>{colored === 0 ? '선화의 넓은 영역 위에 머물러 색을 입혀 보세요.' : `${colored}개의 영역에 색을 입혔어요.`}</p>
      </div>
    </div>
    {colored >= 4 && <div className="success-strip"><Palette /> <b>멋진 작품이에요!</b> 손이 아닌 눈과 얼굴로도 생각을 표현할 수 있어요.</div>}
    <PageNav back={() => {}} next={onNext} hideBack nextLabel="체험 마무리하기" disabled={colored < 4} />
  </section>
}

function Reflection({ selected, setSelected, restart }: { selected: number | null; setSelected: (i: number) => void; restart: () => void }) {
  const answers = ['도구가 있으면 할 수 있어요', '환경을 바꾸면 편해져요', '소통하는 방법은 다양해요']
  return <section className="page finish-page">
    <p className="eyebrow"><Sparkles size={18} /> 체험의 마지막</p>
    <h1>오늘 발견한 것은<br />무엇인가요?</h1>
    <div className="reflection-options">{answers.map((answer, i) => <button data-dwell key={answer} onClick={() => setSelected(i)} className={selected === i ? 'selected' : ''}><span>{i === 0 ? '👁️' : i === 1 ? '🌱' : '💬'}</span><b>{answer}</b>{selected === i && <Check />}</button>)}</div>
    {selected !== null && <div className="final-message"><div className="quote-mark">“</div><p>사람마다 컴퓨터를 사용하는 방법은 다릅니다.<br /><strong>적절한 보조기술과 환경이 있다면<br />누구나 배우고, 소통하고, 창작할 수 있습니다.</strong></p><div className="signature">— 눈으로 여는 교실 —</div></div>}
    {selected !== null && <button data-dwell className="primary jumbo" onClick={restart}><RotateCcw /> 다시 체험하기</button>}
  </section>
}

function PageTitle({ number, icon, title, subtitle }: { number: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="page-title"><span className="section-number">{number}</span><div className="title-icon">{icon}</div><div><h1>{title}</h1><p>{subtitle}</p></div></div>
}

function PageNav({ next, nextLabel, disabled, hideBack }: { back: () => void; next: () => void; nextLabel: string; disabled?: boolean; hideBack?: boolean }) {
  return <div className="page-nav">{!hideBack && <button className="secondary"><ArrowLeft /> 이전</button>}<button data-dwell className="primary" onClick={next} disabled={disabled}>{nextLabel} <ArrowRight /></button></div>
}

export default App
