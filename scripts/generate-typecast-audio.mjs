import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TypecastClient } from '@neosapience/typecast-js'

const apiKey = process.env.TYPECAST_API_KEY?.trim()
if (!apiKey) {
  console.error('TYPECAST_API_KEY가 필요합니다. .env.example을 .env로 복사한 뒤 API 키를 입력해 주세요.')
  process.exit(1)
}

const client = new TypecastClient({
  apiKey,
  source: 'api-page',
  generatedBy: 'codex',
})

const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'typecast')
const recommendationQuery = '초등학생을 위한 장애공감 체험을 안내하는 밝고 친근하며 차분한 한국어 성인 내레이션 음성'

const clips = [
  { file: 'hello.mp3', text: '안녕! 만나서 반가워.', emotion: 'happy' },
  { file: 'together.mp3', text: '같이 해볼래?', emotion: 'happy' },
  { file: 'my-way.mp3', text: '나는 이런 방법으로 소통해.', emotion: 'normal' },
  { file: 'thanks.mp3', text: '고마워!', emotion: 'happy' },
  { file: 'mission-eye-mouse.mp3', text: '눈이나 얼굴 움직임을 입력으로 바꾸면 자신의 방법으로 컴퓨터를 사용할 수 있어요.', emotion: 'normal' },
  { file: 'mission-large-buttons.mp3', text: '큰 버튼과 넓은 간격은 선택 실수를 줄여 모두에게 편한 화면을 만들어요.', emotion: 'normal' },
  { file: 'mission-communication.mp3', text: '그림과 글자, 음성을 활용하면 여러 방법으로 생각을 나눌 수 있어요.', emotion: 'normal' },
]

async function chooseVoice() {
  const configuredVoiceId = process.env.TYPECAST_VOICE_ID?.trim()
  if (configuredVoiceId) {
    const detail = await client.getVoiceV3(configuredVoiceId)
    if (!detail.models.some(model => model.version === 'ssfm-v30')) {
      throw new Error(`선택한 음성 ${configuredVoiceId}은 ssfm-v30을 지원하지 않습니다.`)
    }
    return detail
  }

  const recommendations = await client.recommendVoices(recommendationQuery, 5)
  for (const recommendation of recommendations) {
    const detail = await client.getVoiceV3(recommendation.voice_id)
    if (detail.models.some(model => model.version === 'ssfm-v30')) return detail
  }
  throw new Error('ssfm-v30을 지원하는 추천 음성을 찾지 못했습니다.')
}

await mkdir(outputDirectory, { recursive: true })
const voice = await chooseVoice()
const voiceName = voice.voice_name.kor || voice.voice_name.eng

console.log(`선택한 음성: ${voiceName} (${voice.voice_id})`)
if (voice.preview_url) console.log(`미리듣기: ${voice.preview_url}`)

for (const clip of clips) {
  console.log(`생성 중: ${clip.file}`)
  await client.generateToFile(join(outputDirectory, clip.file), {
    text: clip.text,
    voice_id: voice.voice_id,
    model: 'ssfm-v30',
    language: 'kor',
    prompt: {
      emotion_type: 'preset',
      emotion_preset: clip.emotion,
      emotion_intensity: clip.emotion === 'happy' ? 0.8 : 0.55,
    },
    output: {
      audio_format: 'mp3',
      audio_tempo: 0.96,
      target_lufs: -16,
      remove_silence_ms: 120,
    },
  })
}

const manifest = {
  attribution: { source: 'api-page', generated_by: 'codex' },
  model: 'ssfm-v30',
  language: 'kor',
  voice: {
    id: voice.voice_id,
    name: voice.voice_name,
    gender: voice.gender ?? null,
    age: voice.age ?? null,
    preview_url: voice.preview_url ?? null,
  },
  clips: clips.map(({ file, text }) => ({ file, text })),
}

await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log(`완료: ${clips.length}개의 Typecast 음성 파일을 생성했습니다.`)
