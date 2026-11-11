const SOUNDS = {
  lake: {
    id: "lake",
    label: "잔잔한 호수",
    shortLabel: "호수",
    source: "assets/sound/lake.mp3",
  },
  river: {
    id: "river",
    label: "졸졸 흐르는 물",
    shortLabel: "시냇물",
    source: "assets/sound/river.mp3",
  },
  ocean: {
    id: "ocean",
    label: "파도 소리",
    shortLabel: "파도",
    source: "assets/sound/ocean.mp3",
  },
};

const audioState = {
  selected: "lake",
  target: null,
  isPlaying: false,
  isStarting: false,
  isMuted: false,
  volume: 70,
  generation: 0,
  fadeFrame: 0,
};

const soundButtons = [...document.querySelectorAll(".sound-btn")];
const soundGroup = document.querySelector(".sound-options");
const soundNow = document.querySelector("#sound-now");
const waterStatus = document.querySelector("#water-status");
const audioStatus = document.querySelector("#audio-status");
const playButton = document.querySelector("#play");
const playLabel = document.querySelector("#play-label");
const muteButton = document.querySelector("#mute");
const motionButton = document.querySelector("#motion-toggle");
const motionLabel = document.querySelector("#motion-label");
const backButton = document.querySelector("#back");
const volumeInput = document.querySelector("#volume");
const volumeValue = document.querySelector("#volume-value");
const fallback = document.querySelector("#canvas-fallback");
const audioGains = Object.create(null);
const audioSources = Object.create(null);
let audioContext = null;

const audioTracks = Object.fromEntries(
  Object.values(SOUNDS).map((sound) => {
    const audio = new Audio(sound.source);
    audio.loop = true;
    audio.preload = "metadata";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.addEventListener("error", () => {
      if (audio.dataset.requested === "true") {
        const mediaError = audio.error;
        const cause = mediaError?.code === 2
          ? "네트워크 연결과 서버의 MP3 응답 및 HTTP Range(206) 지원을 확인해 주세요."
          : mediaError?.code === 3
            ? "오디오 파일을 해석하지 못했습니다. MP3 파일을 확인해 주세요."
            : "파일 경로와 서버의 오디오 응답을 확인해 주세요.";
        showAudioError(`${sound.label} 사운드를 불러오지 못했습니다. ${cause}`);
      }
    });
    return [sound.id, audio];
  })
);

function showAudioError(message) {
  audioStatus.textContent = message;
  audioStatus.classList.add("is-visible");
}

function clearAudioError() {
  audioStatus.textContent = "";
  audioStatus.classList.remove("is-visible");
}

function initializeAudioGraph() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("이 브라우저에서 Web Audio를 사용할 수 없습니다. Safari를 최신 버전으로 업데이트해 주세요.");
  }

  if (navigator.audioSession && "type" in navigator.audioSession) {
    try {
      navigator.audioSession.type = "playback";
    } catch {
      // The Audio Session API is optional and varies by iOS version.
    }
  }

  if (!audioContext) audioContext = new AudioContextConstructor();
  if (audioContext.state === "closed") {
    throw new Error("오디오 연결이 종료되었습니다. 페이지를 새로고침한 뒤 다시 눌러 주세요.");
  }

  Object.entries(audioTracks).forEach(([id, audio]) => {
    if (audioGains[id]) return;
    const source = audioContext.createMediaElementSource(audio);
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(audioContext.destination);
    audioSources[id] = source;
    audioGains[id] = gain;
  });

  return audioContext;
}

function describePlaybackError(error) {
  if (error?.name === "NotAllowedError") {
    return "Safari가 재생을 차단했습니다. 페이지 안의 소리 듣기 버튼을 다시 눌러 주세요.";
  }
  if (error?.name === "NotSupportedError") {
    return "이 오디오 파일을 재생할 수 없습니다. MP3 경로와 파일 형식을 확인해 주세요.";
  }
  if (error?.name === "SecurityError") {
    return "안전한 HTTPS 연결에서 페이지를 열어 주세요.";
  }
  return error?.message || "오디오를 시작하지 못했습니다. 연결 상태와 파일을 확인해 주세요.";
}

function failPlayback(error, generation) {
  if (generation !== audioState.generation) return Promise.resolve();
  if (audioState.fadeFrame) cancelAnimationFrame(audioState.fadeFrame);
  audioState.fadeFrame = 0;
  audioState.isPlaying = false;
  audioState.target = null;
  Object.entries(audioTracks).forEach(([id, audio]) => {
    audio.pause();
    if (audioGains[id]) audioGains[id].gain.value = 0;
  });
  updatePlaybackControl();
  showAudioError(describePlaybackError(error));
  waterStatus.textContent = "재생에 실패했어요. 안내를 확인한 뒤 다시 눌러 주세요.";
  return Promise.resolve();
}

function selectSound(id) {
  const sound = SOUNDS[id];
  if (!sound || id === audioState.selected) return;
  audioState.selected = id;
  if (window.waterTherapy) window.waterTherapy.setMode(id);
  soundButtons.forEach((button) => {
    const selected = button.dataset.sound === id;
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  soundNow.textContent = sound.label;
  waterStatus.textContent = audioState.isPlaying
    ? `${sound.label} 소리로 부드럽게 바뀌고 있어요.`
    : `${sound.label} 소리를 선택했어요.`;
  clearAudioError();
  if (audioState.isPlaying) transitionAudio(id);
}

soundGroup.addEventListener("click", (event) => {
  const button = event.target.closest(".sound-btn");
  if (button) selectSound(button.dataset.sound);
});

soundGroup.addEventListener("keydown", (event) => {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
  const currentIndex = soundButtons.findIndex((button) => button.getAttribute("aria-checked") === "true");
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const next = soundButtons[(currentIndex + direction + soundButtons.length) % soundButtons.length];
  event.preventDefault();
  next.focus();
  selectSound(next.dataset.sound);
});

backButton.addEventListener("click", () => {
  if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
    window.history.back();
    return;
  }
  window.location.assign("../");
});

playButton.addEventListener("click", () => {
  if (audioState.isStarting) return;
  if (audioState.isPlaying) {
    pauseAudio();
    waterStatus.textContent = "물소리를 잠시 멈췄어요.";
    return;
  }

  audioState.isPlaying = true;
  audioState.isStarting = true;
  updatePlaybackControl();
  transitionAudio(audioState.selected).finally(() => {
    audioState.isStarting = false;
  });
});

function updatePlaybackControl() {
  playButton.setAttribute("aria-pressed", String(audioState.isPlaying));
  playLabel.textContent = audioState.isPlaying ? "물소리 멈추기" : "물소리 켜기";
}

function transitionAudio(soundId, duration = 1500) {
  const target = audioTracks[soundId];
  if (!target) return Promise.resolve();

  const generation = ++audioState.generation;
  if (audioState.fadeFrame) cancelAnimationFrame(audioState.fadeFrame);
  const previousTarget = audioState.target;
  audioState.target = soundId;

  Object.entries(audioTracks).forEach(([id, audio]) => {
    if (id !== soundId && id !== previousTarget && !audio.paused) {
      audio.pause();
      if (audioGains[id]) audioGains[id].gain.value = 0;
    }
  });

  target.dataset.requested = "true";
  target.loop = true;
  let started;
  try {
    // Keep context creation, source routing, resume(), and play() in the same
    // synchronous user-gesture call stack for iOS Safari.
    const context = initializeAudioGraph();
    const resumePromise = context.state === "running" ? Promise.resolve() : context.resume();
    const playPromise = target.paused ? target.play() : Promise.resolve();
    started = Promise.all([resumePromise, playPromise]);
  } catch (error) {
    return failPlayback(error, generation);
  }

  return started.then(() => {
    if (audioContext.state !== "running") {
      throw new Error("Safari 오디오가 준비되지 않았습니다. 소리 듣기를 다시 눌러 주세요.");
    }
    if (generation !== audioState.generation || !audioState.isPlaying || audioState.selected !== soundId) {
      if (!audioState.isPlaying || audioState.selected !== soundId || audioState.target !== soundId) target.pause();
      return;
    }

    const gains = Object.entries(audioGains);
    const startingVolumes = new Map(gains.map(([id, gain]) => [id, gain.gain.value]));
    const startedAt = performance.now();

    const fade = (now) => {
      if (generation !== audioState.generation) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const targetVolume = audioState.isMuted ? 0 : audioState.volume / 100;

      gains.forEach(([id, gain]) => {
        const endVolume = id === soundId ? targetVolume : 0;
        const startVolume = startingVolumes.get(id);
        gain.gain.value = Math.max(0, Math.min(1, startVolume + (endVolume - startVolume) * eased));
      });

      if (progress < 1) {
        audioState.fadeFrame = requestAnimationFrame(fade);
        return;
      }

      Object.entries(audioTracks).forEach(([id, audio]) => {
        if (id !== soundId) audio.pause();
      });
      audioState.fadeFrame = 0;
      clearAudioError();
      waterStatus.textContent = `${SOUNDS[soundId].label} 소리를 듣고 있어요.`;
    };

    audioState.fadeFrame = requestAnimationFrame(fade);
  }).catch((error) => failPlayback(error, generation));
}

function pauseAudio() {
  audioState.isPlaying = false;
  audioState.isStarting = false;
  audioState.generation += 1;
  updatePlaybackControl();
  if (audioState.fadeFrame) cancelAnimationFrame(audioState.fadeFrame);

  const generation = audioState.generation;
  const gains = Object.entries(audioGains);
  const startingVolumes = gains.map(([, gain]) => gain.gain.value);
  const startedAt = performance.now();
  const duration = 180;

  const fadeOut = (now) => {
    if (generation !== audioState.generation) return;
    const progress = Math.min(1, (now - startedAt) / duration);
    gains.forEach(([, gain], index) => {
      gain.gain.value = startingVolumes[index] * (1 - progress);
    });
    if (progress < 1) {
      audioState.fadeFrame = requestAnimationFrame(fadeOut);
      return;
    }
    tracks.forEach((audio) => audio.pause());
    audioState.fadeFrame = 0;
    audioState.target = null;
  };

  audioState.fadeFrame = requestAnimationFrame(fadeOut);
}

muteButton.addEventListener("click", () => {
  audioState.isMuted = !audioState.isMuted;
  muteButton.setAttribute("aria-pressed", String(audioState.isMuted));
  muteButton.setAttribute("aria-label", audioState.isMuted ? "음소거 해제" : "음소거");
  if (audioState.isPlaying && !audioState.fadeFrame) {
    const activeGain = audioGains[audioState.target || audioState.selected];
    if (activeGain) activeGain.gain.value = audioState.isMuted ? 0 : audioState.volume / 100;
  }
  waterStatus.textContent = audioState.isMuted ? "물소리를 음소거했어요." : "물소리 음소거를 해제했어요.";
});

function syncVolume() {
  audioState.volume = Math.max(0, Math.min(100, Number(volumeInput.value) || 0));
  volumeInput.value = String(audioState.volume);
  volumeInput.setAttribute("aria-valuetext", `${audioState.volume}%`);
  volumeValue.textContent = String(audioState.volume);

  const activeTrack = audioTracks[audioState.target || audioState.selected];
  if (audioState.isPlaying && !audioState.isMuted && activeTrack && !activeTrack.paused) {
    const activeGain = audioGains[audioState.target || audioState.selected];
    if (activeGain) activeGain.gain.value = audioState.volume / 100;
  }
}

volumeInput.addEventListener("input", syncVolume);
volumeInput.addEventListener("change", syncVolume);

function updateMotionControl(enabled) {
  motionButton.setAttribute("aria-pressed", String(!enabled));
  motionLabel.textContent = enabled ? "움직임 멈추기" : "움직임 다시 켜기";
  waterStatus.textContent = enabled ? "수면이 잔잔하게 움직이고 있어요." : "수면 움직임을 멈췄어요.";
}

motionButton.addEventListener("click", () => {
  const enabled = motionButton.getAttribute("aria-pressed") === "true";
  if (window.waterTherapy) window.waterTherapy.setMotionEnabled(enabled);
  updateMotionControl(enabled);
});

if (!window.p5) fallback.classList.add("is-visible");
updatePlaybackControl();
updateMotionControl(window.waterTherapy ? window.waterTherapy.getMotionEnabled() : true);
syncVolume();
