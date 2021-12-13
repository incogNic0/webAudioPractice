const audioContext = new AudioContext() ||  new window.webkitAudioContext();
const lookahead = 25.0;
const scheduleAheadTime = 0.1;
let tempo = 90
let currentStep = 0;
let nextStepTime = 0.0; // when the next note is due.
let timerID;
let isPlaying = false;
let kitState = [
    [false, false, false, false],
    [false, false, false, false],
    [false, false, false, false],
    [false, false, false, false]
]

const audioBuffers = [];
setupSamples(); // add buffer for each sample to audioBuffers


// START / STOP 
const playBtn = document.querySelector('#play-btn');
playBtn.addEventListener('click', handlePlayEvent, false);

// CHANGE TEMPO
const tempoInput = document.querySelector('#tempo');
const tempoDisplay = document.querySelector('#current-tempo');
tempoInput.addEventListener('input', handleTempoChange );

// SELECT PADS
const pads = Array.from(document.querySelectorAll('.pads'));
pads.forEach( pad => {
    pad.addEventListener('click', handlePadClick );
});

// RESET PADS 
const resetBtn = document.querySelector('#reset-btn');
resetBtn.addEventListener('click', handleReset);


// ========== EVENT HANDLERS ============
// START / STOP
async function handlePlayEvent() {
    if(audioContext.state === 'suspended') audioContext.resume();
    isPlaying = !isPlaying

    if(isPlaying) {
        playBtn.textContent = 'Stop'
        currentStep = 0;
        nextStepTime = audioContext.currentTime;
        scheduler(); // handles scheduling and playback
        requestAnimationFrame(draw);
    } else {
        playBtn.textContent = 'Start'
        clearTimeout(timerID);
        audioContext.currentTime = 0;
        clearAnimation();
    }
}

// SELECT PAD
function handlePadClick(evt) {
    const row = Number(evt.target.parentElement.id);
    const elem = evt.target;
    if (elem.classList.contains('pad')) {
        elem.classList.toggle('selected');
    }
    const padsArrray = Array.from(pads[row].children);
    kitState[row] = padsArrray.map( pad => pad.classList.contains('selected'));
}

// CHANGE TEMPO
function handleTempoChange(evt) {
    const newTempo = evt.target.value;
    tempoDisplay.textContent = newTempo;
    tempo = newTempo;
}

// RESET
function handleReset() {
    const selectedPads = Array.from(document.querySelectorAll('.selected'));
    selectedPads.forEach( pad => pad.classList.remove('selected'));
    if(isPlaying) playBtn.dispatchEvent(new Event('click'));
    kitState = [
        [false, false, false, false],
        [false, false, false, false],
        [false, false, false, false],
        [false, false, false, false]
    ]
    tempo = 90;
    tempoInput.value = tempo;
    tempoDisplay.textContent = tempo;
}


// ========== AUDIO ====================


async function getFile(filepath) {
    const res = await fetch(filepath);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

async function setupSamples() {
    const audioElems = Array.from(document.querySelectorAll('audio'));
    for (const audio of audioElems) {
        const url = audio.getAttribute('src');
        const buffer = await getFile(url);
        audioBuffers.push(buffer);
    }
}

function playback(audio, startTime) {
    const playSound = audioContext.createBufferSource();
    playSound.buffer = audio;
    playSound.connect(audioContext.destination);
    playSound.start(startTime); // will play when audioContext.currentTime === startTime
}


function incrementStep() {
    const secondsPerBeat = 60.0 / tempo / 4; // sixteenth notes
    nextStepTime += secondsPerBeat; // when the next step should play
    currentStep++;
    if (currentStep === 4) currentStep = 0; // reset after 4 quarter notes
}


function scheduler() {
    while (nextStepTime < audioContext.currentTime + scheduleAheadTime ) {
        scheduleSamples(currentStep, nextStepTime);
        incrementStep();
    }
    // continues to call scheduler every 25ms (lookahead) 
    timerID = setTimeout(scheduler, lookahead);
}

let stepsQueue = [];
// schedule playback for all active samples in the next step sequence
function scheduleSamples(step, startTime) {
    stepsQueue.push( { step, startTime });
    const len = kitState.length;
    for (let i=0; i<len; i++) {
        const isActive = kitState[i][step];
        if(isActive) {
            playback(audioBuffers[i], startTime);
        }
    }
}

// ========== ANIMATIONS =============

// ANIMATE ALL PADS BOTH ACTIVE AND INACTIVE
let lastStepDrawn = 3;
function draw() {
    let drawStep = lastStepDrawn;
    const currentTime = audioContext.currentTime;

    while (stepsQueue.length && stepsQueue[0].startTime < currentTime) {
        drawStep = stepsQueue[0].step;
        stepsQueue.shift();   // remove note from queue
    }

    // We only need to draw if the note has moved.
    if (lastStepDrawn !== drawStep) {
        pads.forEach(el => {
        el.children[lastStepDrawn].classList.remove('playing-all');
        el.children[drawStep].classList.add('playing-all');
        });

        lastStepDrawn = drawStep;
    }
    // set up to draw again
    requestAnimationFrame(draw);
}

// ANIMATE ONLY ACTIVE PADS
// let lastStepDrawn = 3;
// function draw() {
//     let drawStep = lastStepDrawn;
//     const currentTime = audioContext.currentTime;

//     while (stepsQueue.length && stepsQueue[0].startTime < currentTime) {
//         drawStep = stepsQueue[0].step;
//         stepsQueue.shift();   // remove note from queue
//     }

//     // We only need to draw if the note has moved.
//     if (lastStepDrawn !== drawStep) {
//         pads.forEach((row, index) => {
//             const isActive = kitState[index][drawStep];
//             row.children[lastStepDrawn].classList.remove('playing');
//             if (isActive) row.children[drawStep].classList.add('playing');
//         });

//         lastStepDrawn = drawStep;
//     }
//     // set up to draw again
//     requestAnimationFrame(draw);
// }

function clearAnimation() {
    const lastPlayedPads = Array.from(document.querySelectorAll('.playing'));
    const lastStepPlayed = Array.from(document.querySelectorAll('.playing-all'));
    lastPlayedPads.forEach( pad => pad.classList.remove('playing'));
    lastStepPlayed.forEach( pad => pad.classList.remove('playing-all'))
    stepsQueue = [];
    lastStepDrawn = 3
}



