const audioContext = new AudioContext() || new window.webkitAudioContext();
const filter = audioContext.createBiquadFilter();
const lookahead = 25.0;
const scheduleAheadTime = 0.1;
let tempo = 90;
let currentStep = 0;
let nextStepTime = 0.0; // when the next note is due.
let timerID;
let isPlaying = false;
let activeFilter = false;
let kitState = [
	[false, false, false, false],
	[false, false, false, false],
	[false, false, false, false],
	[false, false, false, false],
];
let animationType = animateAll;
let runAnimation;
const audioBuffers = [];
setupSamples(); // add buffer for each sample to audioBuffers

// START / STOP
const playBtn = document.querySelector("#play-btn");
playBtn.addEventListener("click", handlePlayEvent, false);

// CHANGE TEMPO
const tempoInput = document.querySelector("#tempo");
const tempoDisplay = document.querySelector("#current-tempo");
tempoInput.addEventListener("input", handleTempoChange);

// ADJUST GAIN
const gainInputs = document.querySelectorAll(".gain-input");
gainInputs.forEach((gain) => {
	gain.addEventListener("input", handleGainEvent);
});

// SELECT PADS
const pads = Array.from(document.querySelectorAll(".pads"));
pads.forEach((pad) => {
	pad.addEventListener("click", handlePadClick);
});

// RESET PADS
const resetBtn = document.querySelector("#reset-btn");
resetBtn.addEventListener("click", handleReset);

// ANIMATION SELECTOR
const animationInput = document.querySelector("#animation-input");
animationInput.addEventListener("change", handleAnimationOption);

// FILTERS SELECTION
const lpFilter = document.querySelector('#low-pass'); // low pass
const hpFilter = document.querySelector('#high-pass') // high pass
lpFilter.addEventListener('click', handleFilterClick);
hpFilter.addEventListener('click', handleFilterClick);

// FILTER INPUTS
const filterRes = document.querySelector('#filter-resonance');
const filterCutoff = document.querySelector('#filter-cutoff');
filterRes.addEventListener('input', handleFilterInput);
filterCutoff.addEventListener('input', handleFilterInput);

// ========== EVENT HANDLERS ============
// START / STOP
async function handlePlayEvent() {
	if (audioContext.state === "suspended") audioContext.resume();
	isPlaying = !isPlaying;

	if (isPlaying) {
		playBtn.textContent = "Stop";
		currentStep = 0;
		nextStepTime = audioContext.currentTime;
		scheduler(); // handles scheduling and playback
		runAnimation = requestAnimationFrame(animationType);
	} else {
		playBtn.textContent = "Start";
		clearTimeout(timerID);
		audioContext.currentTime = 0;
		clearAnimation();
		cancelAnimationFrame(runAnimation);
	}
}

// CHANGE TEMPO
function handleTempoChange(evt) {
	const newTempo = evt.target.value;
	tempoDisplay.textContent = newTempo;
	tempo = newTempo;
}

// RESET
function handleReset() {
	const selectedPads = Array.from(document.querySelectorAll(".selected"));
	selectedPads.forEach((pad) => pad.classList.remove("selected"));
	if (isPlaying) playBtn.dispatchEvent(new Event("click"));
	kitState = [
		[false, false, false, false],
		[false, false, false, false],
		[false, false, false, false],
		[false, false, false, false],
	];
	tempo = 90;
	tempoInput.value = tempo;
	tempoDisplay.textContent = tempo;
	gainInputs.forEach((input) => {
		const gainDisplay = input.parentElement.children[0].children[0];
		gainDisplay.textContent = 1;
		input.value = 1;
	});
}

function handleGainEvent(evt) {
	const gainDisplay = evt.target.parentElement.children[0].children[0];
	gainDisplay.textContent = evt.target.value;
}

// SELECT PAD
function handlePadClick(evt) {
	const row = Number(evt.target.parentElement.id);
	const elem = evt.target;
	if (elem.classList.contains("pad")) {
		elem.classList.toggle("selected");
	}
	const padsArrray = Array.from(pads[row].children);
	kitState[row] = padsArrray.map((pad) => pad.classList.contains("selected"));
}

// ANIMATION
function handleAnimationOption(evt) {
	cancelAnimationFrame(runAnimation);
	clearAnimation();
	const checked = evt.target.checked;
	animationType = checked ? animateActive : animateAll;
	runAnimation = requestAnimationFrame(animationType);
}

// FILTER BUTTONS
function handleFilterClick(evt) {
  const btn = evt.target;

  // Turn filter on/off
  activeFilter = !btn.classList.contains('active');
  
  // Set non-clicked btn to disabled if previously wasn't
  if(btn.id === 'low-pass') {
    hpFilter.classList.remove('active');
    filter.type = 'lowpass'

  } else {
    lpFilter.classList.remove('active');
    filter.type = 'highpass'
  }

  filter.frequency.value = adjustedFreq(filterCutoff.value, filter.type);
  filter.Q.value = filterRes.value;
  

  btn.classList.toggle('active');
}

// FILTER INPUTS
function handleFilterInput(evt) {
  const value = evt.target.value;

  if(evt.target.id === 'filter-resonance') {
    const multiplier = filter.type === 'lowpass' ? 1 : 1.5;
    filter.Q.value = Math.floor(value * multiplier);

  } else {
    filter.frequency.value = adjustedFreq(value, filter.type);
  }
  
}

function adjustedFreq(val, type) {
  let freq = val;
  if (type === 'highpass') {
    freq = val * 4;
  }
  if (type === 'lowpass') {
    freq = 12050 - (val * 30);
  }

  return freq;
}


// ========== AUDIO ====================

async function getFile(filepath) {
	const res = await fetch(filepath);
	const arrayBuffer = await res.arrayBuffer();
	const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
	return audioBuffer;
}

async function setupSamples() {
	const audioElems = Array.from(document.querySelectorAll("audio"));
	for (const audio of audioElems) {
		const url = audio.getAttribute("src");
		const buffer = await getFile(url);
		audioBuffers.push(buffer);
	}
}

function playback(data, startTime) {
	const playSound = audioContext.createBufferSource();
	const gainNode = audioContext.createGain();
	gainNode.gain.value = data.gainValue;
	playSound.buffer = data.audio;
  if( activeFilter ) {
    playSound.connect(gainNode).connect(filter).connect(audioContext.destination);
  }  else {
    playSound.connect(gainNode).connect(audioContext.destination);
  }
	playSound.start(startTime); // will play when audioContext.currentTime === startTime
}

function incrementStep() {
	const secondsPerBeat = 60.0 / tempo / 4; // sixteenth notes
	nextStepTime += secondsPerBeat; // when the next step should play
	currentStep++;
	if (currentStep === 4) currentStep = 0; // reset after 4 quarter notes
}

function scheduler() {
	while (nextStepTime < audioContext.currentTime + scheduleAheadTime) {
		scheduleSamples(currentStep, nextStepTime);
		incrementStep();
	}
	// continues to call scheduler every 25ms (lookahead)
	timerID = setTimeout(scheduler, lookahead);
}

let stepsQueue = [];
// schedule playback for all active samples in the next step sequence
function scheduleSamples(step, startTime) {
	stepsQueue.push({ step, startTime });
	const len = kitState.length;
	for (let i = 0; i < len; i++) {
		const isActive = kitState[i][step];
		if (isActive) {
			const params = {
				audio: audioBuffers[i],
				gainValue: gainInputs[i].value,
			};
			playback(params, startTime);
		}
	}
}

// ========== ANIMATIONS =============
let lastStepDrawn = 3;

// ANIMATE ALL PADS BOTH ACTIVE AND INACTIVE
function animateAll() {
	let drawStep = lastStepDrawn;
	const currentTime = audioContext.currentTime;

	while (stepsQueue.length && stepsQueue[0].startTime < currentTime) {
		drawStep = stepsQueue[0].step;
		stepsQueue.shift(); // remove note from queue
	}

	// Only draw if the step moved.
	if (lastStepDrawn !== drawStep) {
		pads.forEach((el) => {
			el.children[lastStepDrawn].classList.remove("playing-all");
			el.children[drawStep].classList.add("playing-all");
		});

		lastStepDrawn = drawStep;
	}
	// set up to draw again
	runAnimation = requestAnimationFrame(animateAll);
}

// ANIMATE ONLY ACTIVE PADS
function animateActive() {
	let drawStep = lastStepDrawn;
	const currentTime = audioContext.currentTime;

	while (stepsQueue.length && stepsQueue[0].startTime < currentTime) {
		drawStep = stepsQueue[0].step;
		stepsQueue.shift(); // remove note from queue
	}

	// Only draw if the step moved.
	if (lastStepDrawn !== drawStep) {
		pads.forEach((row, index) => {
			const isActive = kitState[index][drawStep];
			row.children[lastStepDrawn].classList.remove("playing");
			if (isActive) row.children[drawStep].classList.add("playing");
		});

		lastStepDrawn = drawStep;
	}
	// set up to draw again
	runAnimation = requestAnimationFrame(animateActive);
}

function clearAnimation() {
	const lastPlayedPads = Array.from(document.querySelectorAll(".playing"));
	const lastStepPlayed = Array.from(document.querySelectorAll(".playing-all"));
	lastPlayedPads.forEach((pad) => pad.classList.remove("playing"));
	lastStepPlayed.forEach((pad) => pad.classList.remove("playing-all"));
	stepsQueue = [];
	lastStepDrawn = 3;
}
