# 눈으로 여는 교실

> 다른 방법, 같은 가능성

웹캠으로 얼굴 움직임을 인식해 화면의 선택점을 조작하고, 버튼 위에 일정 시간 머물러 선택하는 장애공감 체험용 눈마우스 프로그램입니다.

## 바로 체험하기

**[GitHub Pages에서 눈마우스 체험하기](https://junho1-commits.github.io/eye-mouse-classroom/)**

Chrome 또는 Edge에서 열고 카메라 사용을 허용해 주세요. 카메라를 사용하지 않아도 일반 마우스로 모든 내용을 체험할 수 있습니다.

## 체험 구성

- 눈마우스 움직임과 응시 선택 연습
- 선택한 말을 음성으로 전달하는 소통 활동
- 사람이 아닌 도구와 환경을 바꾸는 교실 미션
- 눈마우스로 만드는 모자이크 작품
- 보조기술과 접근 가능한 환경의 의미를 생각하는 마무리 활동

## 핵심 메시지

> 사람마다 컴퓨터를 사용하는 방법은 다릅니다. 적절한 보조기술과 환경이 있다면 누구나 배우고, 소통하고, 창작할 수 있습니다.

## 개발 환경

```bash
npm install
npm run dev
```

생성 빌드:

```bash
npm run build
```

## Typecast 음성 생성

음성은 Typecast API로 미리 MP3 파일로 생성합니다. API 키는 로컬 `.env`에만 보관되며 GitHub에 올라가지 않습니다.

1. `.env.example`을 `.env`로 복사합니다.
2. `TYPECAST_API_KEY`에 [Typecast API 콘솔](https://studio.typecast.ai/developers/api)에서 발급한 키를 입력합니다.
3. 필요하면 `TYPECAST_VOICE_ID`에 [API 음성 라이브러리](https://studio.typecast.ai/developers/api/voices)의 음성 ID를 입력합니다. 비워 두면 용도에 맞는 음성을 자동 추천받아 사용합니다.
4. 아래 명령으로 음성을 생성합니다.

```bash
npm run generate:voice
```

Typecast 연동 attribution은 `source=api-page`, `generated_by=codex`로 유지됩니다. 음성 파일이 없거나 재생할 수 없는 환경에서는 브라우저의 기본 한국어 음성으로 자동 전환됩니다.

## 개인정보

카메라 영상은 브라우저 안에서만 처리됩니다. 영상이나 얼굴 정보를 서버로 전송하거나 저장하지 않습니다.
