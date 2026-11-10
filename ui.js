const THEMES = {
  forest: {
    id: "forest",
    name: "FOREST",
    caption: "숲속 계곡",
    description: "이끼와 나뭇잎 사이로 개울이 흐르는 화면",
    sound: "assets/sound/stream.mp3",
  },
  flow: {
    id: "flow",
    name: "BUBBLE",
    caption: "떠 있는 물방울",
    description: "투명한 물방울이 천천히 떠다니는 화면",
    sound: "assets/sound/bubble.mp3",
  },
  underwater: {
    id: "underwater",
    name: "UNDERWATER",
    caption: "깊은 바닷속",
    description: "빛줄기와 기포가 올라오는 수중 화면",
    sound: "assets/sound/underwater.mp3",
  },
};

const audioState = {
  currentScene: "forest",
  isPlaying: false,
  volume: 70,
  targetTrack: null,
  generation: 0,
  fadeFrame: 0,
};

const themeButtons = [...document.querySelectorAll(".theme-btn")];
const themeGroup = document.querySelector(".themes");
const durationGroup = document.querySelector(".duration-options");
const durationButtons = [...document.querySelectorAll(".duration-btn")];
const themeNow = document.querySelector("#theme-now");
const timeReadout = document.querySelector("#time-readout");
const themeStatus = document.querySelector("#theme-status");
const sessionStatus = document.querySelector("#session-status");
const canvasHost = document.querySelector("#water-canvas");
const playButton = document.querySelector("#play");
const resetButton = document.querySelector("#reset");
const playLabel = document.querySelector("#play-label");
const volumeInput = document.querySelector("#volume");
const volumeValue = document.querySelector("#volume-value");
const fallback = document.querySelector("#canvas-fallback");
const audioStatus = document.querySelector("#audio-status");

window.showAudioStatus = (message) => {
  audioStatus.textContent = message;
  audioStatus.classList.toggle("is-visible", Boolean(message));
};

const audioTracks = Object.fromEntries(
  Object.values(THEMES).map((theme) => {
    const audio = new Audio(theme.sound);
    audio.loop = true;
    audio.preload = "none";
    audio.volume = 0;
    audio.addEventListener("error", () => {
      if (audio.dataset.requested === "true") {
        window.showAudioStatus(`${theme.caption} 사운드를 불러오지 못했습니다. 파일 경로를 확인해 주세요.`);
      }
    });
    return [theme.id, audio];
  })
);

let selectedMinutes = 0;
let remainingMs = null;
let sessionDeadline = null;
let sessionTimer = null;

themeButtons.forEach((button) => {
  const theme = THEMES[button.dataset.theme];
  if (theme) button.dataset.sound = theme.sound;
});

function paintTheme(theme, announce) {
  themeButtons.forEach((button) => {
    const selected = button.dataset.theme === theme.id;
    button.setAttribute("aria-checked", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  });
  themeNow.textContent = theme.caption;
  canvasHost.setAttribute("aria-label", theme.description);
  audioState.currentScene = theme.id;
  if (announce) {
    themeStatus.textContent = `${theme.caption} 화면으로 바뀌었습니다.`;
  }
}

function selectTheme(id, announce) {
  const theme = THEMES[id];
  if (!theme || id === audioState.currentScene) return;
  paintTheme(theme, announce);
  if (window.waterTherapy) window.waterTherapy.setTheme(id);
  if (audioState.isPlaying) transitionAudio(id);
}

themeGroup.addEventListener("click", (event) => {
  const button = event.target.closest(".theme-btn");
  if (!button) return;
  selectTheme(button.dataset.theme, true);
});

themeGroup.addEventListener("keydown", (event) => {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
  const currentIndex = themeButtons.findIndex((button) => button.getAttribute("aria-checked") === "true");
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const next = themeButtons[(currentIndex + direction + themeButtons.length) % themeButtons.length];
  event.preventDefault();
  next.focus();
  selectTheme(next.dataset.theme, true);
});

function chooseDuration(button) {
  durationButtons.forEach((option) => {
    const selected = option === button;
    option.setAttribute("aria-checked", String(selected));
    option.tabIndex = selected ? 0 : -1;
  });
  selectedMinutes = Number(button.dataset.minutes);
  remainingMs = selectedMinutes ? selectedMinutes * 60_000 : null;
  timeReadout.textContent = selectedMinutes ? `${selectedMinutes}분` : "자유롭게";

  if (audioState.isPlaying) {
    startSessionTimer();
  } else {
    sessionStatus.textContent = selectedMinutes
      ? `${selectedMinutes}분 동안 편안하게 머물러보세요.`
      : "물소리와 함께 천천히 쉬어가세요.";
  }
}

durationGroup.addEventListener("click", (event) => {
  const button = event.target.closest(".duration-btn");
  if (button) chooseDuration(button);
});

durationGroup.addEventListener("keydown", (event) => {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
  const currentIndex = durationButtons.findIndex((button) => button.getAttribute("aria-checked") === "true");
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const next = durationButtons[(currentIndex + direction + durationButtons.length) % durationButtons.length];
  event.preventDefault();
  next.focus();
  chooseDuration(next);
});

playButton.addEventListener("click", () => {
  if (audioState.isPlaying) {
    pauseAudio();
    sessionStatus.textContent = "잠시 멈췄어요. 준비되면 다시 시작해도 괜찮아요.";
    return;
  }
  playButton.disabled = true;
  audioState.isPlaying = true;
  updatePlayButton();
  transitionAudio(audioState.currentScene)
    .then(() => {
      if (audioState.isPlaying) startSessionTimer();
    })
    .finally(() => {
      playButton.disabled = false;
    });
});

resetButton.addEventListener("click", resetSession);

function updatePlayButton() {
  playButton.setAttribute("aria-pressed", String(audioState.isPlaying));
  playButton.classList.toggle("btn-primary", !audioState.isPlaying);
  playLabel.textContent = audioState.isPlaying ? "잠시 멈추기" : "휴식 시작하기";
}

function syncVolume() {
  audioState.volume = Number(volumeInput.value);
  volumeValue.textContent = String(audioState.volume);
  if (audioState.isPlaying) transitionAudio(audioState.currentScene, 180);
}

volumeInput.addEventListener("input", syncVolume);

function transitionAudio(themeId, duration = 1500) {
  const target = audioTracks[themeId];
  if (!target) return Promise.resolve();
  const generation = ++audioState.generation;
  if (audioState.fadeFrame) cancelAnimationFrame(audioState.fadeFrame);
  const previousTarget = audioState.targetTrack;
  audioState.targetTrack = themeId;
  Object.entries(audioTracks).forEach(([id, audio]) => {
    if (id !== themeId && id !== previousTarget && !audio.paused) {
      audio.pause();
      audio.volume = 0;
    }
  });
  target.dataset.requested = "true";
  target.loop = true;

  // Invoke play directly from the user's first click to honor browser autoplay policies.
  const started = target.paused ? target.play() : Promise.resolve();
  return started.then(() => {
    if (generation !== audioState.generation || !audioState.isPlaying || themeId !== audioState.currentScene) {
      if (!audioState.isPlaying || themeId !== audioState.currentScene || audioState.targetTrack !== themeId) {
        target.pause();
      }
      return;
    }

    const tracks = Object.entries(audioTracks);
    const starts = new Map(tracks.map(([id, audio]) => [id, audio.volume]));
    const beganAt = performance.now();

    const step = (now) => {
      if (generation !== audioState.generation) return;
      const progress = Math.min(1, (now - beganAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const master = audioState.volume / 100;
      tracks.forEach(([id, audio]) => {
        const goal = id === themeId ? master : 0;
        audio.volume = Math.max(0, Math.min(1, starts.get(id) + (goal - starts.get(id)) * eased));
      });

      if (progress < 1) {
        audioState.fadeFrame = requestAnimationFrame(step);
        return;
      }

      tracks.forEach(([id, audio]) => {
        if (id !== themeId) {
          audio.pause();
        }
      });
      audioState.fadeFrame = 0;
      window.showAudioStatus("");
    };

    audioState.fadeFrame = requestAnimationFrame(step);
  }).catch((error) => {
    if (generation === audioState.generation) {
      if (sessionTimer) window.clearInterval(sessionTimer);
      sessionTimer = null;
      sessionDeadline = null;
      remainingMs = selectedMinutes ? selectedMinutes * 60_000 : null;
      audioState.isPlaying = false;
      audioState.targetTrack = null;
      updatePlayButton();
      Object.values(audioTracks).forEach((audio) => audio.pause());
      window.showAudioStatus(error.message || "재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  });
}

function pauseAudio() {
  if (sessionTimer) window.clearInterval(sessionTimer);
  sessionTimer = null;
  if (sessionDeadline !== null) remainingMs = Math.max(0, sessionDeadline - Date.now());
  sessionDeadline = null;
  audioState.isPlaying = false;
  audioState.generation += 1;
  updatePlayButton();
  if (audioState.fadeFrame) cancelAnimationFrame(audioState.fadeFrame);
  const tracks = Object.values(audioTracks);
  const starts = tracks.map((audio) => audio.volume);
  const beganAt = performance.now();
  const duration = 180;
  const generation = audioState.generation;

  const step = (now) => {
    if (generation !== audioState.generation) return;
    const progress = Math.min(1, (now - beganAt) / duration);
    const remaining = 1 - progress;
    tracks.forEach((audio, index) => {
      audio.volume = starts[index] * remaining;
    });
    if (progress < 1) {
      audioState.fadeFrame = requestAnimationFrame(step);
    } else {
      tracks.forEach((audio) => {
        audio.pause();
      });
      audioState.targetTrack = null;
      audioState.fadeFrame = 0;
    }
  };
  audioState.fadeFrame = requestAnimationFrame(step);
}

function startSessionTimer() {
  if (sessionTimer) window.clearInterval(sessionTimer);
  if (!selectedMinutes) {
    sessionDeadline = null;
    timeReadout.textContent = "자유롭게";
    sessionStatus.textContent = "원하는 만큼 천천히 머물러보세요.";
    return;
  }

  if (remainingMs === null || remainingMs <= 0) remainingMs = selectedMinutes * 60_000;
  sessionDeadline = Date.now() + remainingMs;

  const updateCountdown = () => {
    remainingMs = Math.max(0, sessionDeadline - Date.now());
    const secondsLeft = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = String(secondsLeft % 60).padStart(2, "0");
    timeReadout.textContent = `${minutes}:${seconds}`;
    sessionStatus.textContent = `남은 시간 ${minutes}:${seconds} · 서두르지 않아도 괜찮아요.`;
    if (remainingMs > 0) return;

    window.clearInterval(sessionTimer);
    sessionTimer = null;
    sessionDeadline = null;
    audioState.isPlaying = false;
    audioState.generation += 1;
    if (audioState.fadeFrame) cancelAnimationFrame(audioState.fadeFrame);
    const tracks = Object.values(audioTracks);
    const starts = tracks.map((audio) => audio.volume);
    const beganAt = performance.now();
    const finishFade = (now) => {
      const progress = Math.min(1, (now - beganAt) / 1500);
      tracks.forEach((audio, index) => {
        audio.volume = starts[index] * (1 - progress);
      });
      if (progress < 1) {
        audioState.fadeFrame = requestAnimationFrame(finishFade);
      } else {
        tracks.forEach((audio) => audio.pause());
        audioState.targetTrack = null;
        audioState.fadeFrame = 0;
      }
    };
    audioState.fadeFrame = requestAnimationFrame(finishFade);
    updatePlayButton();
    timeReadout.textContent = "완료";
    sessionStatus.textContent = "설정한 시간이 끝났어요. 소리가 천천히 잦아들고 있어요.";
  };

  updateCountdown();
  sessionTimer = window.setInterval(updateCountdown, 1000);
}

function resetSession() {
  pauseAudio();
  const forestButton = themeButtons.find((button) => button.dataset.theme === "forest");
  if (forestButton) selectTheme("forest", false);
  const openEndedButton = durationButtons.find((button) => button.dataset.minutes === "0");
  if (openEndedButton) chooseDuration(openEndedButton);
  timeReadout.textContent = "자유롭게";
  sessionStatus.textContent = "처음으로 돌아왔어요. 원할 때 다시 시작해보세요.";
  window.showAudioStatus("");
}

if (!window.p5) fallback.classList.add("is-visible");

paintTheme(THEMES.forest, false);
syncVolume();
